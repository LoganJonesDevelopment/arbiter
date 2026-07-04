import asyncio
import logging
from datetime import datetime, UTC, timedelta

from contextlib import asynccontextmanager
from sqlalchemy import delete
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from arbiter.config import settings
from arbiter.db import init_db, async_session
from arbiter.models import Snapshot
from arbiter.polymarket import PolymarketCollector
from arbiter.kalshi import KalshiCollector
from arbiter import analyzers
from arbiter.matching import match_events, find_cross_exchange_arbs
from arbiter.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
scan_lock = asyncio.Lock()
startup_scan_task: asyncio.Task | None = None


async def prune_snapshots(session):
    cutoff = datetime.now(UTC) - timedelta(hours=48)
    result = await session.execute(
        delete(Snapshot).where(Snapshot.timestamp < cutoff)
    )
    await session.commit()
    if result.rowcount:
        logger.info(f"Pruned {result.rowcount} old snapshots")


async def run_scan():
    async with async_session() as session:
        poly_collector = PolymarketCollector()
        kalshi_collector = KalshiCollector()

        poly_result = await poly_collector.collect(session)
        kalshi_result = await kalshi_collector.collect(session)

        analysis_result = await analyzers.run_all(session)

        matches = await match_events(session)
        cross_arbs = await find_cross_exchange_arbs(session)

        await prune_snapshots(session)

        return {
            "polymarket": poly_result,
            "kalshi": kalshi_result,
            "matches": len(matches),
            "cross_exchange_arbs": len(cross_arbs),
            "analysis": analysis_result,
        }


async def scheduled_scan():
    if scan_lock.locked():
        logger.info("Scan already in progress, skipping")
        return
    async with scan_lock:
        logger.info("Starting scheduled scan...")
        try:
            result = await run_scan()
            logger.info(f"Scan complete: {result}")
        except Exception:
            logger.exception("Scan failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global startup_scan_task
    await init_db()
    logger.info("Database initialized")

    startup_scan_task = asyncio.create_task(scheduled_scan())

    scheduler.add_job(
        scheduled_scan,
        "interval",
        minutes=settings.collection_interval_minutes,
        id="scan",
    )
    scheduler.start()
    logger.info(f"Scheduler started (interval: {settings.collection_interval_minutes}m)")

    yield

    scheduler.shutdown()


app = FastAPI(title="Arbiter", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("arbiter.main:app", host="0.0.0.0", port=8888, reload=True)
