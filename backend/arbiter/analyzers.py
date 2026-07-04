import logging
from datetime import datetime, UTC, timedelta

from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from arbiter.config import settings
from arbiter.fees import polymarket_fee
from arbiter.models import Event, Market, Opportunity, Snapshot

logger = logging.getLogger(__name__)


async def run_all(session: AsyncSession) -> dict:
    await session.execute(
        update(Opportunity)
        .where(Opportunity.status == "active", Opportunity.type.in_(["multi_outcome_arb", "tailing"]))
        .values(status="stale")
    )

    multi = await analyze_multi_outcome(session)
    tailing = await analyze_tailing(session)

    await session.execute(
        update(Opportunity)
        .where(Opportunity.status == "stale", Opportunity.type.in_(["multi_outcome_arb", "tailing"]))
        .values(status="expired")
    )

    await session.commit()

    logger.info(f"Analysis complete: {len(multi)} multi-outcome, {len(tailing)} tailing")
    return {"multi_outcome": len(multi), "tailing": len(tailing)}


async def analyze_multi_outcome(session: AsyncSession) -> list[dict]:
    result = await session.execute(
        select(Event).where(
            Event.active.is_(True),
            Event.markets_count > 1,
            Event.neg_risk.is_(True),
        )
    )
    events = result.scalars().all()

    markets_result = await session.execute(
        select(Market).join(Event, Market.event_id == Event.id).where(
            Event.active.is_(True),
            Event.markets_count > 1,
            Event.neg_risk.is_(True),
        )
    )
    markets_by_event: dict[str, list[Market]] = {}
    for m in markets_result.scalars().all():
        markets_by_event.setdefault(m.event_id, []).append(m)

    opportunities = []

    for event in events:
        all_markets = markets_by_event.get(event.id, [])

        active_markets = []
        inactive_count = 0
        for m in all_markets:
            if m.active and not m.closed and m.outcome_prices and len(m.outcome_prices) > 0:
                active_markets.append(m)
            else:
                inactive_count += 1

        if len(active_markets) < 2:
            continue

        yes_prices = []
        market_details = []
        total_volume = 0.0
        min_liquidity = float("inf")
        has_thin_leg = False

        for m in active_markets:
            yes_price = m.outcome_prices[0]
            liq = m.liquidity or 0

            if liq < settings.min_liquidity_per_leg:
                has_thin_leg = True

            yes_prices.append(yes_price)
            market_details.append({
                "market_id": m.id,
                "question": m.question,
                "yes_price": round(yes_price, 4),
                "volume": round(m.volume or 0, 2),
                "liquidity": round(liq, 2),
            })
            total_volume += m.volume or 0
            min_liquidity = min(min_liquidity, liq)

        price_sum = sum(yes_prices)
        num_legs = len(yes_prices)

        # Skip near-zero events (resolved but not settled)
        if price_sum < 0.05:
            continue

        is_complete = inactive_count == 0
        total_fees = polymarket_fee(min(yes_prices))
        cost_with_fees = price_sum + total_fees

        if price_sum >= 1.0:
            raw_edge = (price_sum - 1.0) * 100
            direction = "overpriced"
            fee_adjusted_edge = (price_sum - total_fees - 1.0) * 100
            profit_per_share = price_sum - total_fees - 1.0
        else:
            raw_edge = (1.0 - price_sum) * 100
            direction = "underpriced"
            fee_adjusted_edge = (1.0 - cost_with_fees) * 100
            profit_per_share = 1.0 - cost_with_fees

        if raw_edge < settings.min_edge_pct:
            continue

        if total_volume < settings.min_volume:
            continue

        if min_liquidity == float("inf"):
            min_liquidity = 0

        too_many_legs = num_legs > settings.max_practical_legs
        requires_shorting = direction == "overpriced"

        # A price sum far from 1.0 means missing outcomes, not a mispricing.
        # Real arbs are small deviations. Large gaps = untracked outcomes.
        likely_missing_outcomes = (
            (direction == "underpriced" and price_sum < 0.90)
            or (direction == "overpriced" and price_sum > 1.15)
        )

        if likely_missing_outcomes:
            executable = False
            quality = "theoretical"
            if direction == "underpriced":
                gap_pct = (1.0 - price_sum) * 100
                trade_desc = (
                    f"NOT an arb: {num_legs} tracked outcomes sum to ${price_sum:.4f}. "
                    f"The {gap_pct:.0f}% gap is untracked outcome probability, not edge."
                )
            else:
                trade_desc = (
                    f"NOT an arb: {num_legs} outcomes sum to ${price_sum:.4f} "
                    f"(${price_sum - 1.0:.4f} over). Likely stale or illiquid pricing."
                )
        elif not is_complete and direction == "underpriced":
            executable = False
            quality = "theoretical"
            trade_desc = (
                f"NOT an arb: {inactive_count} unlisted outcome slots exist. "
                f"Active outcomes sum to ${price_sum:.4f}, leaving "
                f"{raw_edge:.1f}% for unlisted candidates."
            )
        elif requires_shorting:
            executable = False
            quality = "theoretical"
            trade_desc = (
                f"Overpriced: {num_legs} outcomes sum to ${price_sum:.4f} "
                f"(${price_sum - 1.0:.4f} over). Requires shorting all YES to capture."
            )
        elif too_many_legs:
            executable = False
            quality = "theoretical"
            trade_desc = (
                f"Buy all {num_legs} YES for ${price_sum:.4f} + ${total_fees:.4f} fees. "
                f"Too many legs to practically execute."
            )
        else:
            executable = fee_adjusted_edge > 0 and not has_thin_leg
            if executable:
                quality = (
                    "high" if fee_adjusted_edge > 1.0 and min_liquidity > 2000 else
                    "medium" if fee_adjusted_edge > 0.5 else
                    "low"
                )
            else:
                quality = "theoretical"
            trade_desc = (
                f"Buy all {num_legs} YES outcomes for ${price_sum:.4f} "
                f"(+${total_fees:.4f} fees), guaranteed $1.00 payout. "
                f"Net cost: ${cost_with_fees:.4f}"
            )

        if profit_per_share > 0 and price_sum > 0:
            shares_at_100 = 100.0 / price_sum
            est_profit = shares_at_100 * profit_per_share
        else:
            est_profit = 0

        market_details.sort(key=lambda m: m["yes_price"], reverse=True)

        end_date = event.end_date
        if not end_date:
            for m in active_markets:
                if m.end_date:
                    end_date = m.end_date
                    break

        opp = {
            "type": "multi_outcome_arb",
            "event_id": event.id,
            "event_title": event.title,
            "slug": event.slug,
            "category": event.category,
            "end_date": end_date.isoformat() if end_date else None,
            "direction": direction,
            "num_legs": num_legs,
            "total_markets": len(all_markets),
            "inactive_markets": inactive_count,
            "is_complete": is_complete,
            "price_sum": round(price_sum, 4),
            "raw_edge_pct": round(raw_edge, 2),
            "fee_adjusted_edge_pct": round(fee_adjusted_edge, 2),
            "total_fees": round(total_fees, 4),
            "profit_per_share": round(profit_per_share, 4),
            "est_profit_at_100": round(est_profit, 2),
            "trade_description": trade_desc,
            "total_volume": round(total_volume, 2),
            "min_liquidity": round(min_liquidity, 2),
            "has_thin_leg": has_thin_leg,
            "quality": quality,
            "executable": executable,
            "markets": market_details,
        }
        opportunities.append(opp)

        opp_key = f"multi_outcome:{event.id}"
        await _upsert_opportunity(
            session, opp_key, opp,
            edge=fee_adjusted_edge if executable else raw_edge,
        )

    return opportunities


async def analyze_tailing(session: AsyncSession) -> list[dict]:
    threshold = settings.min_certainty_pct / 100.0

    result = await session.execute(
        select(Market).where(
            Market.active.is_(True),
            Market.closed.is_(False),
            Market.volume >= settings.min_volume,
            Market.liquidity >= settings.min_liquidity_per_leg,
        )
    )
    markets = result.scalars().all()

    recent_cutoff = datetime.now(UTC) - timedelta(minutes=30)

    candidates = []
    for market in markets:
        if not market.outcome_prices or len(market.outcome_prices) < 2:
            continue
        high_price = max(market.outcome_prices[0], market.outcome_prices[1])
        if high_price < threshold or high_price >= 0.99:
            continue
        candidates.append(market)

    if not candidates:
        return []

    event_ids = {m.event_id for m in candidates}
    event_result = await session.execute(select(Event).where(Event.id.in_(event_ids)))
    events_by_id = {e.id: e for e in event_result.scalars().all()}

    latest_snapshot = (
        select(Snapshot.market_id, func.max(Snapshot.timestamp).label("ts"))
        .where(
            Snapshot.market_id.in_([m.id for m in candidates]),
            Snapshot.timestamp < recent_cutoff,
        )
        .group_by(Snapshot.market_id)
        .subquery()
    )
    snapshot_result = await session.execute(
        select(Snapshot).join(
            latest_snapshot,
            (Snapshot.market_id == latest_snapshot.c.market_id)
            & (Snapshot.timestamp == latest_snapshot.c.ts),
        )
    )
    prev_by_market = {s.market_id: s for s in snapshot_result.scalars().all()}

    opportunities = []

    for market in candidates:
        yes_price = market.outcome_prices[0]
        no_price = market.outcome_prices[1]
        high_price = max(yes_price, no_price)

        prev = prev_by_market.get(market.id)

        price_move = 0.0
        momentum = "stable"
        if prev:
            prev_high = max(prev.yes_price or 0, prev.no_price or 0)
            price_move = high_price - prev_high
            if price_move > settings.tailing_min_price_move:
                momentum = "surging"
            elif price_move > 0.005:
                momentum = "drifting_up"
            elif price_move < -0.01:
                momentum = "pulling_back"

        if momentum == "stable" and high_price < 0.97:
            continue

        event = events_by_id.get(market.event_id)
        likely_outcome = "Yes" if yes_price > no_price else "No"
        edge = (1.0 - high_price) * 100
        fee = polymarket_fee(high_price)
        fee_adjusted_edge = edge - (fee * 100)

        cost_per_share = high_price
        profit_per_share = 1.0 - cost_per_share - fee
        if cost_per_share > 0:
            shares_at_100 = 100.0 / cost_per_share
            est_profit = shares_at_100 * profit_per_share
        else:
            est_profit = 0

        quality = (
            "high" if momentum == "surging" and fee_adjusted_edge > 1.0 else
            "medium" if fee_adjusted_edge > 0.5 and (market.liquidity or 0) > 2000 else
            "low" if fee_adjusted_edge > 0 else
            "theoretical"
        )

        trade_desc = (
            f"Buy {likely_outcome} @ ${high_price:.4f} (+${fee:.4f} fee), "
            f"payout $1.00 if {likely_outcome}. "
            f"Risk ${high_price:.2f} to make ${profit_per_share:.4f}."
        )

        end_date = market.end_date or (event.end_date if event else None)

        opp = {
            "type": "tailing",
            "event_id": market.event_id,
            "end_date": end_date.isoformat() if end_date else None,
            "event_title": event.title if event else "",
            "slug": event.slug if event else "",
            "category": event.category if event else "",
            "market_id": market.id,
            "question": market.question,
            "likely_outcome": likely_outcome,
            "price": round(high_price, 4),
            "raw_edge_pct": round(edge, 2),
            "fee_adjusted_edge_pct": round(fee_adjusted_edge, 2),
            "profit_per_share": round(profit_per_share, 4),
            "est_profit_at_100": round(est_profit, 2),
            "trade_description": trade_desc,
            "volume": round(market.volume or 0, 2),
            "liquidity": round(market.liquidity or 0, 2),
            "momentum": momentum,
            "price_move": round(price_move, 4),
            "quality": quality,
            "executable": fee_adjusted_edge > 0,
        }
        opportunities.append(opp)

        opp_key = f"tailing:{market.id}"
        await _upsert_opportunity(
            session, opp_key, opp,
            edge=fee_adjusted_edge,
        )

    return opportunities


async def _upsert_opportunity(session: AsyncSession, opp_key: str, opp: dict, edge: float = 0):
    result = await session.execute(
        select(Opportunity).where(Opportunity.opp_key == opp_key)
    )
    existing = result.scalar_one_or_none()

    market_ids = [m["market_id"] for m in opp.get("markets", [])] or [opp.get("market_id", "")]

    if existing:
        existing.edge_pct = edge
        existing.details = opp
        existing.markets_involved = market_ids
        existing.last_seen = datetime.now(UTC)
        existing.status = "active"
    else:
        session.add(Opportunity(
            opp_key=opp_key,
            type=opp["type"],
            event_id=opp["event_id"],
            edge_pct=edge,
            details=opp,
            markets_involved=market_ids,
            status="active",
        ))
