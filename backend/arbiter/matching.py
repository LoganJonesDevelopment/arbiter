import logging
import re
from datetime import datetime, UTC

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from arbiter.models import Event, Market, EventMatch, Opportunity

logger = logging.getLogger(__name__)

MIN_EVENT_MATCH_CONFIDENCE = 0.6
MIN_MARKET_MATCH_CONFIDENCE = 0.5
MIN_VOLUME_FOR_ARB = 100
MIN_PRICE_FOR_ARB = 0.01
MAX_EDGE_PCT = 25.0


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _tokenize(text: str) -> set[str]:
    stop = {"the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
            "will", "be", "by", "before", "after", "who", "what", "when", "how"}
    words = _normalize(text).split()
    return {w for w in words if w not in stop and (len(w) > 1 or w.isdigit())}


def _extract_numbers(text: str) -> set[str]:
    return set(re.findall(r'\d+(?:\.\d+)?', _normalize(text)))


def _numbers_compatible(text_a: str, text_b: str) -> bool:
    nums_a = _extract_numbers(text_a)
    nums_b = _extract_numbers(text_b)
    if not nums_a or not nums_b:
        return True
    return bool(nums_a & nums_b)


def _outcome_descriptor(market: Market) -> str:
    if market.source == "kalshi" and market.outcomes:
        sub = market.outcomes[0]
        if sub and sub not in ("Yes", "No"):
            return sub
    return market.question or ""


def _market_type(question: str) -> str:
    q = question.lower()
    if "o/u" in q or "over/under" in q or "total " in q:
        return "over_under"
    if "spread" in q:
        return "spread"
    if "winner" in q or " vs " in q or " vs. " in q or " win " in q:
        return "winner"
    return "other"


def _market_types_compatible(q_a: str, q_b: str) -> bool:
    ta = _market_type(q_a)
    tb = _market_type(q_b)
    if ta == "other" or tb == "other":
        return True
    return ta == tb


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    intersection = a & b
    union = a | b
    return len(intersection) / len(union)


def _market_has_price(m: Market) -> bool:
    if not m.outcome_prices or len(m.outcome_prices) < 2:
        return False
    return m.outcome_prices[0] >= MIN_PRICE_FOR_ARB or m.outcome_prices[1] >= MIN_PRICE_FOR_ARB


async def match_events(session: AsyncSession) -> list[dict]:
    poly_result = await session.execute(
        select(Event).where(Event.source == "polymarket", Event.active.is_(True))
    )
    poly_events = poly_result.scalars().all()

    kalshi_result = await session.execute(
        select(Event).where(Event.source == "kalshi", Event.active.is_(True))
    )
    kalshi_events = kalshi_result.scalars().all()

    if not poly_events or not kalshi_events:
        logger.info(f"Not enough events to match: {len(poly_events)} poly, {len(kalshi_events)} kalshi")
        return []

    poly_tokens = [(e, _tokenize(e.title)) for e in poly_events]
    kalshi_tokens = [(e, _tokenize(e.title)) for e in kalshi_events]

    matches = []

    for pe, pt in poly_tokens:
        if len(pt) < 2:
            continue

        best_score = 0.0
        best_kalshi = None

        for ke, kt in kalshi_tokens:
            score = _jaccard(pt, kt)
            if score > best_score:
                best_score = score
                best_kalshi = ke

        if best_score < MIN_EVENT_MATCH_CONFIDENCE or not best_kalshi:
            continue

        existing = await session.execute(
            select(EventMatch).where(
                EventMatch.poly_event_id == pe.id,
                EventMatch.kalshi_event_id == best_kalshi.id,
            )
        )
        match = existing.scalar_one_or_none()

        if not match:
            match = EventMatch(
                poly_event_id=pe.id,
                kalshi_event_id=best_kalshi.id,
                confidence=round(best_score, 4),
                match_method="jaccard_title",
                verified=False,
            )
            session.add(match)
        else:
            match.confidence = round(best_score, 4)

        matches.append({
            "poly_event": pe.title,
            "poly_id": pe.id,
            "kalshi_event": best_kalshi.title,
            "kalshi_id": best_kalshi.id,
            "confidence": round(best_score, 4),
        })

    await session.commit()
    logger.info(f"Event matching complete: {len(matches)} matches found")
    return matches


async def find_cross_exchange_arbs(session: AsyncSession) -> list[dict]:
    await session.execute(
        update(Opportunity)
        .where(Opportunity.status == "active", Opportunity.type == "cross_exchange_arb")
        .values(status="stale")
    )

    result = await session.execute(
        select(EventMatch).where(EventMatch.confidence >= MIN_EVENT_MATCH_CONFIDENCE)
    )
    event_matches = result.scalars().all()

    if not event_matches:
        await session.execute(
            update(Opportunity)
            .where(Opportunity.status == "stale", Opportunity.type == "cross_exchange_arb")
            .values(status="expired")
        )
        await session.commit()
        return []

    opportunities = []

    for em in event_matches:
        poly_markets_result = await session.execute(
            select(Market).where(
                Market.event_id == em.poly_event_id,
                Market.active.is_(True),
                Market.closed.is_(False),
            )
        )
        poly_markets = [m for m in poly_markets_result.scalars().all() if _market_has_price(m)]

        kalshi_markets_result = await session.execute(
            select(Market).where(
                Market.event_id == em.kalshi_event_id,
                Market.active.is_(True),
                Market.closed.is_(False),
            )
        )
        kalshi_markets = [m for m in kalshi_markets_result.scalars().all() if _market_has_price(m)]

        if not poly_markets or not kalshi_markets:
            continue

        poly_event = await session.get(Event, em.poly_event_id)
        kalshi_event = await session.get(Event, em.kalshi_event_id)

        if poly_event and kalshi_event and poly_event.neg_risk and kalshi_event.neg_risk:
            arbs = _find_multi_market_arbs(poly_markets, kalshi_markets, poly_event, kalshi_event, em)
            opportunities.extend(arbs)
        elif len(poly_markets) == 1 and len(kalshi_markets) == 1:
            arb = _check_binary_arb(poly_markets[0], kalshi_markets[0], poly_event, kalshi_event, em)
            if arb:
                opportunities.append(arb)
        else:
            arbs = _match_and_check_markets(poly_markets, kalshi_markets, poly_event, kalshi_event, em)
            opportunities.extend(arbs)

    opportunities = [o for o in opportunities if o["edge_pct"] <= MAX_EDGE_PCT]

    for opp in opportunities:
        opp_key = f"cross_exchange:{opp['poly_market_id']}:{opp['kalshi_market_id']}"
        market_ids = [opp["poly_market_id"], opp["kalshi_market_id"]]

        existing_result = await session.execute(
            select(Opportunity).where(Opportunity.opp_key == opp_key)
        )
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.edge_pct = opp["edge_pct"]
            existing.details = opp
            existing.markets_involved = market_ids
            existing.last_seen = datetime.now(UTC)
            existing.status = "active"
        else:
            session.add(Opportunity(
                opp_key=opp_key,
                type="cross_exchange_arb",
                event_id=opp["poly_event_id"],
                edge_pct=opp["edge_pct"],
                details=opp,
                markets_involved=market_ids,
                status="active",
            ))

    await session.execute(
        update(Opportunity)
        .where(Opportunity.status == "stale", Opportunity.type == "cross_exchange_arb")
        .values(status="expired")
    )

    await session.commit()
    logger.info(f"Cross-exchange arb scan: {len(opportunities)} opportunities found")
    return opportunities


def _match_and_check_markets(
    poly_markets: list[Market],
    kalshi_markets: list[Market],
    poly_event: Event | None,
    kalshi_event: Event | None,
    em: EventMatch,
) -> list[dict]:
    arbs = []
    kalshi_data = []
    for m in kalshi_markets:
        desc = _outcome_descriptor(m)
        tokens = _tokenize(desc)
        kalshi_data.append((m, desc, tokens))

    for pm in poly_markets:
        poly_desc = _outcome_descriptor(pm)
        pt = _tokenize(poly_desc)
        if len(pt) < 2:
            continue

        if not _market_types_compatible(pm.question or "", kalshi_markets[0].question or ""):
            continue

        best_score = 0.0
        best_km = None
        for km, k_desc, kt in kalshi_data:
            if not _numbers_compatible(poly_desc, k_desc):
                continue
            score = _jaccard(pt, kt)
            if score > best_score:
                best_score = score
                best_km = km

        if best_score >= MIN_MARKET_MATCH_CONFIDENCE and best_km:
            arb = _check_binary_arb(pm, best_km, poly_event, kalshi_event, em)
            if arb:
                arb["market_match_confidence"] = round(best_score, 4)
                arbs.append(arb)

    return arbs


def _check_binary_arb(
    poly_market: Market,
    kalshi_market: Market,
    poly_event: Event | None,
    kalshi_event: Event | None,
    em: EventMatch,
) -> dict | None:
    if not poly_market.outcome_prices or not kalshi_market.outcome_prices:
        return None
    if len(poly_market.outcome_prices) < 2 or len(kalshi_market.outcome_prices) < 2:
        return None

    poly_yes = poly_market.outcome_prices[0]
    poly_no = poly_market.outcome_prices[1]
    kalshi_yes = kalshi_market.outcome_prices[0]
    kalshi_no = kalshi_market.outcome_prices[1]

    if poly_yes < MIN_PRICE_FOR_ARB and poly_no < MIN_PRICE_FOR_ARB:
        return None
    if kalshi_yes < MIN_PRICE_FOR_ARB and kalshi_no < MIN_PRICE_FOR_ARB:
        return None

    poly_fee_rate = 0.02

    best_arb = None
    best_edge = 0.0

    for buy_yes_src, buy_yes_price, buy_no_src, buy_no_price in [
        ("polymarket", poly_yes, "kalshi", kalshi_no),
        ("kalshi", kalshi_yes, "polymarket", poly_no),
    ]:
        if buy_yes_price < MIN_PRICE_FOR_ARB or buy_no_price < MIN_PRICE_FOR_ARB:
            continue

        cost = buy_yes_price + buy_no_price
        if cost >= 1.0:
            continue

        gross_profit = 1.0 - cost

        kalshi_price = buy_yes_price if buy_yes_src == "kalshi" else buy_no_price

        poly_fee_amt = poly_fee_rate
        kalshi_fee_amt = 0.07 * kalshi_price * (1.0 - kalshi_price)

        net_profit = gross_profit - poly_fee_amt - kalshi_fee_amt
        edge_pct = (net_profit / cost) * 100 if cost > 0 else 0

        if net_profit > 0 and edge_pct > best_edge:
            best_edge = edge_pct
            best_arb = {
                "type": "cross_exchange_arb",
                "match_confidence": em.confidence,
                "event_title": poly_event.title if poly_event else "",
                "poly_event_id": em.poly_event_id,
                "kalshi_event_id": em.kalshi_event_id,
                "poly_market_id": poly_market.id,
                "kalshi_market_id": kalshi_market.id,
                "poly_question": poly_market.question,
                "kalshi_question": kalshi_market.question,
                "strategy": f"Buy YES on {buy_yes_src} @ ${buy_yes_price:.4f}, "
                           f"Buy NO on {buy_no_src} @ ${buy_no_price:.4f}",
                "total_cost": round(cost, 4),
                "gross_profit": round(gross_profit, 4),
                "net_profit": round(net_profit, 4),
                "edge_pct": round(edge_pct, 2),
                "poly_yes": round(poly_yes, 4),
                "poly_no": round(poly_no, 4),
                "kalshi_yes": round(kalshi_yes, 4),
                "kalshi_no": round(kalshi_no, 4),
                "poly_volume": round(poly_market.volume or 0, 2),
                "kalshi_volume": round(kalshi_market.volume or 0, 2),
                "poly_liquidity": round(poly_market.liquidity or 0, 2),
                "kalshi_liquidity": round(kalshi_market.liquidity or 0, 2),
            }

    return best_arb


def _find_multi_market_arbs(
    poly_markets: list[Market],
    kalshi_markets: list[Market],
    poly_event: Event,
    kalshi_event: Event,
    em: EventMatch,
) -> list[dict]:
    kalshi_descriptors = []
    for m in kalshi_markets:
        desc = _outcome_descriptor(m)
        tokens = _tokenize(desc)
        kalshi_descriptors.append((m, desc, tokens))

    arbs = []
    for pm in poly_markets:
        poly_desc = _outcome_descriptor(pm)
        pt = _tokenize(poly_desc)
        if len(pt) < 2:
            continue

        best_score = 0.0
        best_km = None
        for km, k_desc, kt in kalshi_descriptors:
            if not _numbers_compatible(poly_desc, k_desc):
                continue
            score = _jaccard(pt, kt)
            if score > best_score:
                best_score = score
                best_km = km

        if best_score >= MIN_MARKET_MATCH_CONFIDENCE and best_km:
            arb = _check_binary_arb(pm, best_km, poly_event, kalshi_event, em)
            if arb:
                arb["market_match_confidence"] = round(best_score, 4)
                arbs.append(arb)

    return arbs
