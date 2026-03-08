from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from arbiter.db import get_session
from arbiter.models import Event, Market, Opportunity, Snapshot

router = APIRouter(prefix="/api")


@router.get("/stats")
async def get_stats(session: AsyncSession = Depends(get_session)):
    events_count = await session.scalar(select(func.count(Event.id)).where(Event.active.is_(True)))
    markets_count = await session.scalar(select(func.count(Market.id)).where(Market.active.is_(True)))
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
    last_snapshot = await session.scalar(select(func.max(Snapshot.timestamp)))

    return {
        "events": events_count or 0,
        "markets": markets_count or 0,
        "active_opportunities": active_opps or 0,
        "multi_outcome_opportunities": multi_opps or 0,
        "tailing_opportunities": tailing_opps or 0,
        "last_scan": last_snapshot.isoformat() if last_snapshot else None,
    }


QUALITY_RANK = {"high": 0, "medium": 1, "low": 2, "theoretical": 3}


@router.get("/opportunities")
async def get_opportunities(
    type: str | None = Query(None),
    status: str = Query("active"),
    sort_by: str = Query("quality"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    query = select(Opportunity).where(Opportunity.status == status)

    if type:
        query = query.where(Opportunity.type == type)

    if sort_by in ("last_seen", "first_seen"):
        query = query.order_by(desc(getattr(Opportunity, sort_by)))
    else:
        query = query.order_by(desc(Opportunity.edge_pct))

    if sort_by != "quality":
        query = query.limit(limit).offset(offset)

    result = await session.execute(query)
    opps = result.scalars().all()

    items = []
    for o in opps:
        details = dict(o.details) if o.details else {}
        details.pop("markets", None)
        items.append({
            "id": o.id,
            "opp_key": o.opp_key,
            "type": o.type,
            "event_id": o.event_id,
            "edge_pct": o.edge_pct,
            "details": details,
            "markets_involved": o.markets_involved,
            "first_seen": o.first_seen.isoformat(),
            "last_seen": o.last_seen.isoformat(),
            "status": o.status,
        })

    if sort_by == "quality":
        items.sort(key=lambda x: (
            QUALITY_RANK.get(x["details"].get("quality", "theoretical"), 3),
            -x["edge_pct"],
        ))
        items = items[offset:offset + limit]

    return items


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
