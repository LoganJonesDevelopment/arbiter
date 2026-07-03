from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, text
from sqlalchemy.ext.asyncio import AsyncSession

from arbiter.db import get_session
from arbiter.models import Event, Market, Opportunity, Snapshot

router = APIRouter(prefix="/api")

QUALITY_RANK = {"high": 0, "medium": 1, "low": 2, "theoretical": 3}


def _action_summary(details: dict) -> str:
    if "trade_description" in details:
        return details["trade_description"]
    if "strategy" in details:
        return details["strategy"]
    return ""


def _actionability_score(details: dict) -> float:
    quality = details.get("quality", "theoretical")
    executable = details.get("executable", False)
    if not executable or quality == "theoretical":
        return 0.0

    if details.get("type") == "cross_exchange_arb":
        edge = details.get("edge_pct", 0)
        liq = min(details.get("poly_liquidity", 0), details.get("kalshi_liquidity", 0))
        vol = min(details.get("poly_volume", 0), details.get("kalshi_volume", 0))
    else:
        edge = details.get("fee_adjusted_edge_pct", 0)
        liq = details.get("min_liquidity", details.get("liquidity", 0))
        vol = details.get("total_volume", details.get("volume", 0))

    liq_factor = min(1.0, liq / 5000) if liq > 0 else 0
    vol_factor = min(1.0, vol / 50000) if vol > 0 else 0

    quality_mult = {"high": 1.0, "medium": 0.7, "low": 0.3}.get(quality, 0)

    return round(edge * liq_factor * vol_factor * quality_mult, 4)


@router.get("/stats")
async def get_stats(session: AsyncSession = Depends(get_session)):
    events_count = await session.scalar(select(func.count(Event.id)).where(Event.active.is_(True)))
    markets_count = await session.scalar(select(func.count(Market.id)).where(Market.active.is_(True)))
    poly_events = await session.scalar(
        select(func.count(Event.id)).where(Event.active.is_(True), Event.source == "polymarket")
    )
    kalshi_events = await session.scalar(
        select(func.count(Event.id)).where(Event.active.is_(True), Event.source == "kalshi")
    )
    active_opps = await session.scalar(
        select(func.count(Opportunity.id)).where(Opportunity.status == "active")
    )
    multi_opps = await session.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.status == "active", Opportunity.type == "multi_outcome_arb"
        )
    )
    tailing_opps = await session.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.status == "active", Opportunity.type == "tailing"
        )
    )
    cross_opps = await session.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.status == "active", Opportunity.type == "cross_exchange_arb"
        )
    )

    executable_opps = await session.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.status == "active",
            text("json_extract(details, '$.executable') = 1"),
        )
    )

    last_snapshot = await session.scalar(select(func.max(Snapshot.timestamp)))

    return {
        "events": events_count or 0,
        "markets": markets_count or 0,
        "polymarket_events": poly_events or 0,
        "kalshi_events": kalshi_events or 0,
        "active_opportunities": active_opps or 0,
        "executable_opportunities": executable_opps or 0,
        "multi_outcome_opportunities": multi_opps or 0,
        "tailing_opportunities": tailing_opps or 0,
        "cross_exchange_opportunities": cross_opps or 0,
        "last_scan": last_snapshot.isoformat() if last_snapshot else None,
    }


@router.get("/opportunities")
async def get_opportunities(
    type: str | None = Query(None),
    status: str = Query("active"),
    sort_by: str = Query("score"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    executable_only: bool = Query(True),
    max_days: int | None = Query(None, ge=1),
    session: AsyncSession = Depends(get_session),
):
    base_filter = [Opportunity.status == status]
    if type:
        base_filter.append(Opportunity.type == type)
    if executable_only:
        base_filter.append(text("json_extract(details, '$.executable') = 1"))
    if max_days is not None:
        cutoff = (datetime.now(UTC) + timedelta(days=max_days)).isoformat()
        base_filter.append(text(
            f"json_extract(details, '$.end_date') IS NOT NULL "
            f"AND json_extract(details, '$.end_date') <= '{cutoff}'"
        ))

    total = await session.scalar(
        select(func.count(Opportunity.id)).where(*base_filter)
    )

    query = select(Opportunity).where(*base_filter)

    if sort_by in ("last_seen", "first_seen"):
        query = query.order_by(desc(getattr(Opportunity, sort_by)))
        query = query.limit(limit).offset(offset)
    elif sort_by == "edge":
        query = query.order_by(desc(Opportunity.edge_pct))
        query = query.limit(limit).offset(offset)
    else:
        query = query.order_by(desc(Opportunity.edge_pct)).limit(1000)

    result = await session.execute(query)
    opps = result.scalars().all()

    now = datetime.now(UTC)
    items = []
    for o in opps:
        details = dict(o.details) if o.details else {}
        score = _actionability_score(details)

        end_date_str = details.get("end_date")
        days_to_resolution = None
        if end_date_str:
            try:
                end_dt = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=UTC)
                delta = (end_dt - now).total_seconds() / 86400
                days_to_resolution = max(0, round(delta, 1))
            except (ValueError, AttributeError):
                pass

        items.append({
            "id": o.id,
            "opp_key": o.opp_key,
            "type": o.type,
            "event_id": o.event_id,
            "edge_pct": o.edge_pct,
            "details": details,
            "action_summary": _action_summary(details),
            "score": score,
            "end_date": end_date_str,
            "days_to_resolution": days_to_resolution,
            "markets_involved": o.markets_involved,
            "first_seen": o.first_seen.isoformat(),
            "last_seen": o.last_seen.isoformat(),
            "status": o.status,
        })

    if sort_by in ("score", "quality"):
        if sort_by == "score":
            items.sort(key=lambda x: x["score"], reverse=True)
        else:
            items.sort(key=lambda x: (
                QUALITY_RANK.get(x["details"].get("quality", "theoretical"), 3),
                -x["edge_pct"],
            ))
        items = items[offset:offset + limit] if sort_by != "score" else items[:limit]

    return {
        "items": items,
        "total": total or 0,
        "offset": offset,
        "limit": limit,
    }


@router.get("/events")
async def get_events(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    query = select(Event).where(Event.active.is_(True))

    if search:
        query = query.where(Event.title.ilike(f"%{search}%"))

    query = query.order_by(desc(Event.last_updated)).limit(limit).offset(offset)
    result = await session.execute(query)
    events = result.scalars().all()

    return [
        {
            "id": e.id,
            "title": e.title,
            "slug": e.slug,
            "category": e.category,
            "neg_risk": e.neg_risk,
            "markets_count": e.markets_count,
            "last_updated": e.last_updated.isoformat(),
        }
        for e in events
    ]


@router.get("/events/{event_id}")
async def get_event_detail(event_id: str, session: AsyncSession = Depends(get_session)):
    event = await session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    result = await session.execute(
        select(Market).where(Market.event_id == event_id).order_by(desc(Market.volume))
    )
    markets = result.scalars().all()

    return {
        "id": event.id,
        "title": event.title,
        "slug": event.slug,
        "category": event.category,
        "neg_risk": event.neg_risk,
        "markets_count": event.markets_count,
        "markets": [
            {
                "id": m.id,
                "question": m.question,
                "outcomes": m.outcomes,
                "outcome_prices": m.outcome_prices,
                "volume": m.volume,
                "liquidity": m.liquidity,
                "active": m.active,
                "closed": m.closed,
            }
            for m in markets
        ],
    }


@router.get("/markets/{market_id}/history")
async def get_market_history(
    market_id: str,
    hours: int = Query(24, ge=1, le=720),
    session: AsyncSession = Depends(get_session),
):
    cutoff = datetime.now(UTC) - timedelta(hours=hours)

    result = await session.execute(
        select(Snapshot)
        .where(
            Snapshot.market_id == market_id,
            Snapshot.timestamp >= cutoff,
        )
        .order_by(Snapshot.timestamp)
    )
    snapshots = result.scalars().all()

    return [
        {
            "yes_price": s.yes_price,
            "no_price": s.no_price,
            "volume": s.volume,
            "timestamp": s.timestamp.isoformat(),
        }
        for s in snapshots
    ]


@router.post("/scan")
async def trigger_scan():
    from arbiter.main import scan_lock, run_scan

    if scan_lock.locked():
        return {"status": "scan already in progress"}

    async with scan_lock:
        result = await run_scan()
        return result


@router.post("/reanalyze")
async def trigger_reanalyze(session: AsyncSession = Depends(get_session)):
    """Re-run analysis and matching on existing data without re-collecting."""
    from arbiter import analyzers
    from arbiter.matching import match_events, find_cross_exchange_arbs

    analysis_result = await analyzers.run_all(session)
    matches = await match_events(session)
    cross_arbs = await find_cross_exchange_arbs(session)

    return {
        "analysis": analysis_result,
        "matches": len(matches),
        "cross_exchange_arbs": len(cross_arbs),
    }
