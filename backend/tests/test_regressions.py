import os

os.environ.update(DATABASE_URL="sqlite+aiosqlite:///:memory:", COLLECTION_ENABLED="false",
                  FEE_RATE="0.02", KALSHI_PROFIT_FEE="0.07", MIN_VOLUME="10000",
                  MIN_EDGE_PCT="0.5", MIN_LIQUIDITY_PER_LEG="500", MAX_PRACTICAL_LEGS="20",
                  MIN_CERTAINTY_PCT="95", TAILING_MIN_PRICE_MOVE="0.02")

import asyncio
import socket
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from arbiter import analyzers, main, matching
from arbiter.config import settings
from arbiter.db import get_session
from arbiter.fees import kalshi_fee, polymarket_fee
from arbiter.models import Base, Event, EventMatch, Market, Opportunity, Snapshot


def event(id="e", source="polymarket", **kw):
    return Event(id=id, title="Fictional tournament winner", source=source, active=True,
                 neg_risk=True, markets_count=2, **kw)


def market(id="m", event_id="e", price=.47, **kw):
    values = dict(id=id, event_id=event_id, source="polymarket", question="Fictional Falcons win",
                  outcomes=["Yes", "No"], outcome_prices=[price, 1-price], volume=12000,
                  liquidity=3000, active=True, closed=False)
    values.update(kw)
    return Market(**values)


class DomainTests(unittest.TestCase):
    def test_configured_fee_models_at_boundaries_and_midpoint(self):
        for price, poly, kalshi in [(0, .02, 0), (.5, .01, .0175), (1, 0, 0)]:
            with self.subTest(price=price):
                self.assertAlmostEqual(polymarket_fee(price), poly)
                self.assertAlmostEqual(kalshi_fee(price), kalshi)
        self.assertAlmostEqual(kalshi_fee(.2), kalshi_fee(.8))

    def test_binary_purchase_direction_and_net_cost_after_both_fees(self):
        poly = market(price=.45)
        kalshi = market(id="k", price=.58, source="kalshi")
        em = EventMatch(poly_event_id="e", kalshi_event_id="k", confidence=.9)
        result = matching._check_binary_arb(poly, kalshi, event(), event("k", "kalshi"), em)
        self.assertEqual(result["buy_yes_exchange"], "polymarket")
        self.assertEqual(result["buy_no_exchange"], "kalshi")
        self.assertEqual(result["total_cost"], .87)
        self.assertEqual(result["net_profit"], .1019)
        self.assertEqual(result["edge_pct"], 11.72)
        self.assertEqual(result["poly_fee"], .011)
        self.assertEqual(result["kalshi_fee"], .0171)
        self.assertEqual(result["quality"], "high")

    def test_gross_discount_consumed_by_fees_is_not_an_arb(self):
        em = EventMatch(poly_event_id="e", kalshi_event_id="k", confidence=.9)
        result = matching._check_binary_arb(market(price=.5), market(price=.51), event(), event("k"), em)
        self.assertIsNone(result)

    def test_matching_rejects_unrelated_contract_types_and_unshared_thresholds(self):
        self.assertFalse(matching._market_types_compatible("Falcons winner", "Falcons spread"))
        self.assertFalse(matching._numbers_compatible("Temperature above 50", "Temperature above 60"))
        self.assertEqual(matching._jaccard(set(), {"Falcons"}), 0)
        self.assertFalse(matching._market_has_price(market(liquidity=499)))
        self.assertFalse(matching._market_has_price(market(outcome_prices=[0, 0])))



class DatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.network_guard = patch.object(socket, "getaddrinfo", side_effect=AssertionError("Network is forbidden in regression tests"))
        self.network_guard.start()
        connect = socket.socket.connect
        def local_only(sock, address):
            if sock.family in (socket.AF_INET, socket.AF_INET6):
                raise AssertionError("Network is forbidden in regression tests")
            return connect(sock, address)
        self.connect_guard = patch.object(socket.socket, "connect", local_only)
        self.connect_guard.start()
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.session = self.sessions()
        async def session_override():
            yield self.session
        main.app.dependency_overrides[get_session] = session_override
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://fixture.invalid")

    async def asyncTearDown(self):
        await self.client.aclose()
        main.app.dependency_overrides.clear()
        await self.session.close()
        await self.engine.dispose()
        self.connect_guard.stop()
        self.network_guard.stop()

    async def seed_pair(self, prices=(.47, .47), **kw):
        e = event()
        for key, value in kw.items():
            setattr(e, key, value)
        self.session.add_all([e, market("m1", price=prices[0]), market("m2", price=prices[1])])
        await self.session.commit()
        return e

    async def test_complete_liquid_bundle_fee_cost_and_upsert_lifecycle(self):
        await self.seed_pair()
        result = await analyzers.run_all(self.session)
        self.assertEqual(result, {"multi_outcome": 1, "tailing": 0})
        opp = (await self.session.scalars(select(Opportunity))).one()
        self.assertTrue(opp.details["executable"])
        self.assertEqual(opp.details["total_fees"], .0106)
        self.assertEqual(opp.details["profit_per_share"], .0494)
        self.assertEqual(opp.details["fee_adjusted_edge_pct"], 4.94)
        id = opp.id
        await analyzers.run_all(self.session)
        self.assertEqual((await self.session.scalars(select(Opportunity))).one().id, id)
        (await self.session.get(Market, "m1")).outcome_prices = [.5, .5]
        (await self.session.get(Market, "m2")).outcome_prices = [.5, .5]
        await self.session.commit()
        await analyzers.run_all(self.session)
        self.assertEqual((await self.session.get(Opportunity, id)).status, "expired")

    async def test_shorting_and_missing_probability_are_theoretical(self):
        await self.seed_pair((.55, .55))
        result = await analyzers.analyze_multi_outcome(self.session)
        self.assertFalse(result[0]["executable"])
        self.assertIn("shorting", result[0]["trade_description"])
        for id in ["m1", "m2"]:
            (await self.session.get(Market, id)).outcome_prices = [.3, .7]
        await self.session.commit()
        result = await analyzers.analyze_multi_outcome(self.session)
        self.assertFalse(result[0]["executable"])
        self.assertIn("NOT an arb", result[0]["trade_description"])

    async def test_thin_leg_prevents_executable_bundle(self):
        await self.seed_pair()
        (await self.session.get(Market, "m1")).liquidity = 499
        await self.session.commit()
        result = await analyzers.analyze_multi_outcome(self.session)
        self.assertFalse(result[0]["executable"])
        self.assertTrue(result[0]["has_thin_leg"])

    @unittest.expectedFailure
    async def test_known_defect_unfetched_declared_outcome_must_not_be_executable(self):
        await self.seed_pair(markets_count=3)
        result = await analyzers.analyze_multi_outcome(self.session)
        self.assertFalse(result[0]["executable"])

    async def test_tailing_uses_older_snapshot_and_retains_conditional_payout(self):
        await self.seed_pair((.98, .5))
        self.session.add_all([
            Snapshot(market_id="m1", yes_price=.90, no_price=.10, timestamp=datetime.now(UTC)-timedelta(minutes=45)),
            Snapshot(market_id="m1", yes_price=.979, no_price=.021, timestamp=datetime.now(UTC)-timedelta(minutes=2)),
        ])
        await self.session.commit()
        result = await analyzers.analyze_tailing(self.session)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["momentum"], "surging")
        self.assertEqual(result[0]["likely_outcome"], "Yes")
        self.assertEqual(result[0]["fee_adjusted_edge_pct"], 1.96)
        self.assertIn("if Yes", result[0]["trade_description"])

    async def test_cross_exchange_matching_persists_and_expires_when_liquidity_disappears(self):
        self.session.add_all([event(), event("k", "kalshi"), market(price=.45),
                              market("km", "k", .58, source="kalshi")])
        await self.session.commit()
        matches = await matching.match_events(self.session)
        self.assertEqual(len(matches), 1)
        results = await matching.find_cross_exchange_arbs(self.session)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["net_profit"], .1019)
        (await self.session.get(Market, "km")).liquidity = 10
        await self.session.commit()
        self.assertEqual(await matching.find_cross_exchange_arbs(self.session), [])
        opp = (await self.session.scalars(select(Opportunity))).one()
        self.assertEqual(opp.status, "expired")

    @unittest.expectedFailure
    async def test_known_defect_different_thresholds_in_shared_year_must_not_form_an_arb(self):
        poly_title = "Inflation above 2.5 percent in 2026"
        kalshi_title = "Inflation above 3.5 percent in 2026"
        poly, kalshi = event(), event("k", "kalshi")
        poly.title, kalshi.title = poly_title, kalshi_title
        self.session.add_all([poly, kalshi, market(price=.45, question=poly_title),
                              market("km", "k", .58, source="kalshi", question=kalshi_title)])
        await self.session.commit()
        await matching.match_events(self.session)
        self.assertEqual(await matching.find_cross_exchange_arbs(self.session), [])

    @unittest.expectedFailure
    async def test_known_defect_kalshi_tailing_must_use_configured_kalshi_fee(self):
        await self.seed_pair((.98, .5), source="kalshi")
        (await self.session.get(Market, "m1")).source = "kalshi"
        await self.session.commit()
        result = await analyzers.analyze_tailing(self.session)
        self.assertEqual(result[0]["fee_adjusted_edge_pct"], 1.86)

    async def test_api_filters_theoretical_results_and_reports_seeded_counts(self):
        await self.seed_pair()
        await analyzers.run_all(self.session)
        self.session.add(Opportunity(opp_key="theoretical", type="multi_outcome_arb", event_id="e", edge_pct=50,
            details={"type":"multi_outcome_arb", "executable":False,"quality":"theoretical"}, markets_involved=["m1"]))
        await self.session.commit()
        response = await self.client.get("/api/opportunities")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 1)
        self.assertTrue(response.json()["items"][0]["details"]["executable"])
        self.assertGreater(response.json()["items"][0]["score"], 0)
        all_items = (await self.client.get("/api/opportunities?executable_only=false&limit=1&offset=1")).json()
        self.assertEqual(all_items["total"], 2)
        self.assertEqual(len(all_items["items"]), 1)
        stats = (await self.client.get("/api/stats")).json()
        self.assertEqual((stats["events"], stats["markets"], stats["active_opportunities"]), (1,2,2))
        self.assertEqual(stats["executable_opportunities"], 1)
        self.assertEqual((await self.client.get("/api/events/e")).json()["markets_count"], 2)
        self.assertEqual((await self.client.get("/api/events/missing")).status_code, 404)
        self.assertEqual((await self.client.get("/api/opportunities?limit=0")).status_code, 422)

    async def test_history_window_orders_and_prunes_only_old_snapshots(self):
        await self.seed_pair()
        now = datetime.now(UTC)
        for hours in [60, 20, 1]:
            self.session.add(Snapshot(market_id="m1", yes_price=.47, no_price=.53, timestamp=now-timedelta(hours=hours)))
        await self.session.commit()
        history = (await self.client.get("/api/markets/m1/history?hours=24")).json()
        self.assertEqual(len(history), 2)
        self.assertLess(history[0]["timestamp"], history[1]["timestamp"])
        await main.prune_snapshots(self.session)
        self.assertEqual(len((await self.session.scalars(select(Snapshot))).all()), 2)

    async def test_collection_enabled_retains_startup_and_scheduler_contract(self):
        previous_task = main.startup_scan_task
        try:
            with patch.object(settings, "collection_enabled", True), patch.object(main, "init_db", new=AsyncMock()), \
                 patch.object(main, "scheduler", new=Mock()) as scheduler, \
                 patch.object(main, "scheduled_scan", new=AsyncMock()) as scan:
                async with main.lifespan(main.app):
                    await asyncio.sleep(0)
                    scan.assert_awaited_once()
                    scheduler.start.assert_called_once()
                    scheduler.add_job.assert_called_once_with(scan, "interval", minutes=settings.collection_interval_minutes, id="scan")
                scheduler.shutdown.assert_called_once()
        finally:
            if main.startup_scan_task and not main.startup_scan_task.done():
                main.startup_scan_task.cancel()
                await asyncio.gather(main.startup_scan_task, return_exceptions=True)
            main.startup_scan_task = previous_task

    async def test_collection_off_blocks_startup_scheduler_manual_scan_and_direct_scan(self):
        with patch.object(main, "init_db", new=AsyncMock()), patch.object(main.scheduler, "start") as start:
            async with main.lifespan(main.app):
                start.assert_not_called()
                self.assertIsNone(main.startup_scan_task)
        self.assertEqual((await self.client.post("/api/scan")).status_code, 503)
        with patch.object(main, "PolymarketCollector") as collector:
            with self.assertRaisesRegex(RuntimeError, "Collection is disabled"):
                await main.run_scan()
            await main.scheduled_scan()
            collector.assert_not_called()


if __name__ == "__main__":
    unittest.main()
