import logging
from datetime import datetime, UTC

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from arbiter.config import settings
from arbiter.models import Event, Market, Snapshot

logger = logging.getLogger(__name__)

SOURCE = "kalshi"


def _prefixed_id(raw_id: str) -> str:
    return f"kalshi:{raw_id}"


def _dollars_to_float(dollars_value) -> float:
    try:
        return float(dollars_value)
    except (ValueError, TypeError):
        return 0.0


class KalshiCollector:
    def __init__(self):
        self.base_url = settings.kalshi_api_url

    async def collect(self, session: AsyncSession) -> dict:
        events_count = 0
        markets_count = 0
        cursor = ""

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                params: dict = {
                    "limit": 100,
                    "with_nested_markets": "true",
                    "status": "open",
                }
                if cursor:
                    params["cursor"] = cursor

                resp = await client.get(
                    f"{self.base_url}/events",
                    params=params,
                )
                resp.raise_for_status()
                body = resp.json()

                raw_events = body.get("events", [])
                if not raw_events:
                    break

                for event_data in raw_events:
                    mc = await self._upsert_event(session, event_data)
                    events_count += 1
                    markets_count += mc

                cursor = body.get("cursor", "")
                if not cursor:
                    break

                logger.info(f"Fetched {events_count} Kalshi events so far...")

        await session.commit()
        logger.info(f"Kalshi collection complete: {events_count} events, {markets_count} markets")
        return {"events": events_count, "markets": markets_count}

    @staticmethod
    def _parse_end_date(data: dict) -> datetime | None:
        for field in ("close_time", "expiration_time", "expected_expiration_time"):
            val = data.get(field)
            if not val:
                continue
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue
        return None

    async def _upsert_event(self, session: AsyncSession, data: dict) -> int:
        raw_ticker = data.get("event_ticker", "")
        event_id = _prefixed_id(raw_ticker)
        markets_data = data.get("markets") or []

        event = await session.get(Event, event_id)

        if not event:
            event = Event(
                id=event_id,
                source=SOURCE,
                title=data.get("title", ""),
                slug=raw_ticker,
                category=data.get("category"),
                end_date=self._parse_end_date(markets_data[0]) if markets_data else None,
                active=True,
                neg_risk=data.get("mutually_exclusive", False),
                markets_count=len(markets_data),
            )
            session.add(event)
        else:
            event.title = data.get("title", event.title)
            event.category = data.get("category") or event.category
            event.neg_risk = data.get("mutually_exclusive", event.neg_risk)
            event.markets_count = len(markets_data)
            event.last_updated = datetime.now(UTC)

        for market_data in markets_data:
            await self._upsert_market(session, event_id, market_data)

        return len(markets_data)

    async def _upsert_market(self, session: AsyncSession, event_id: str, data: dict):
        raw_ticker = data.get("ticker", "")
        market_id = _prefixed_id(raw_ticker)

        yes_bid = _dollars_to_float(data.get("yes_bid_dollars", "0"))
        yes_ask = _dollars_to_float(data.get("yes_ask_dollars", "0"))
        no_bid = _dollars_to_float(data.get("no_bid_dollars", "0"))
        no_ask = _dollars_to_float(data.get("no_ask_dollars", "0"))
        last_price = _dollars_to_float(data.get("last_price_dollars", "0"))

        yes_price = (yes_bid + yes_ask) / 2 if (yes_bid > 0 and yes_ask > 0) else last_price
        no_price = (no_bid + no_ask) / 2 if (no_bid > 0 and no_ask > 0) else (1.0 - yes_price)

        outcome_prices = [round(yes_price, 4), round(no_price, 4)]
        outcomes = [
            data.get("yes_sub_title", "Yes"),
            data.get("no_sub_title", "No"),
        ]

        volume = _dollars_to_float(data.get("volume_fp", "0"))
        open_interest = _dollars_to_float(data.get("open_interest_fp", "0"))
        status = data.get("status", "")

        market = await session.get(Market, market_id)

        if not market:
            market = Market(
                id=market_id,
                source=SOURCE,
                event_id=event_id,
                question=data.get("title", ""),
                end_date=self._parse_end_date(data),
                condition_id=raw_ticker,
                clob_token_ids=None,
                outcomes=outcomes,
                outcome_prices=outcome_prices,
                volume=volume,
                liquidity=open_interest,
                active=status == "active",
                closed=status in ("closed", "settled"),
            )
            session.add(market)
        else:
            market.outcome_prices = outcome_prices
            market.outcomes = outcomes
            market.volume = volume
            market.liquidity = open_interest
            market.active = status == "active"
            market.closed = status in ("closed", "settled")
            market.last_updated = datetime.now(UTC)

        if outcome_prices and yes_price > 0:
            snapshot = Snapshot(
                market_id=market_id,
                yes_price=outcome_prices[0],
                no_price=outcome_prices[1],
                volume=volume,
                liquidity=open_interest,
            )
            session.add(snapshot)
