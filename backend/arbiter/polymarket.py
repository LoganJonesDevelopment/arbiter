import json
import logging
from datetime import datetime, UTC

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from arbiter.config import settings
from arbiter.models import Event, Market, Snapshot

logger = logging.getLogger(__name__)

SOURCE = "polymarket"


def _prefixed_id(raw_id: str) -> str:
    return f"poly:{raw_id}"


class PolymarketCollector:
    def __init__(self):
        self.gamma_url = settings.polymarket_gamma_url
        self.clob_url = settings.polymarket_clob_url

    async def collect(self, session: AsyncSession) -> dict:
        events_count = 0
        markets_count = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            offset = 0
            limit = 100

            while True:
                resp = await client.get(
                    f"{self.gamma_url}/events",
                    params={
                        "active": "true",
                        "closed": "false",
                        "limit": limit,
                        "offset": offset,
                    },
                )
                resp.raise_for_status()
                events = resp.json()

                if not events:
                    break

                for event_data in events:
                    mc = await self._upsert_event(session, event_data)
                    events_count += 1
                    markets_count += mc

                offset += limit
                logger.info(f"Fetched {offset} events so far...")

        await session.commit()
        logger.info(f"Collection complete: {events_count} events, {markets_count} markets")
        return {"events": events_count, "markets": markets_count}

    @staticmethod
    def _extract_category(data: dict) -> str | None:
        tags = data.get("tags", [])
        if not tags:
            return None
        return tags[0].get("label") if isinstance(tags[0], dict) else str(tags[0])

    @staticmethod
    def _parse_end_date(data: dict) -> datetime | None:
        end = data.get("endDate") or data.get("end_date_iso")
        if not end:
            return None
        try:
            return datetime.fromisoformat(end.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    async def _upsert_event(self, session: AsyncSession, data: dict) -> int:
        event_id = _prefixed_id(str(data["id"]))
        markets_data = data.get("markets", [])
        category = self._extract_category(data)

        event = await session.get(Event, event_id)

        if not event:
            event = Event(
                id=event_id,
                source=SOURCE,
                title=data.get("title", ""),
                slug=data.get("slug"),
                category=category,
                end_date=self._parse_end_date(data),
                active=data.get("active", True),
                neg_risk=data.get("negRisk", False),
                markets_count=len(markets_data),
            )
            session.add(event)
        else:
            event.title = data.get("title", event.title)
            event.slug = data.get("slug", event.slug)
            event.category = category or event.category
            event.end_date = self._parse_end_date(data) or event.end_date
            event.active = data.get("active", event.active)
            event.neg_risk = data.get("negRisk", event.neg_risk)
            event.markets_count = len(markets_data)
            event.last_updated = datetime.now(UTC)

        for market_data in markets_data:
            await self._upsert_market(session, event_id, market_data)

        return len(markets_data)

    async def _upsert_market(self, session: AsyncSession, event_id: str, data: dict):
        market_id = _prefixed_id(str(data["id"]))

        outcomes = self._parse_json_field(data.get("outcomes", "[]"))
        outcome_prices = self._parse_json_field(data.get("outcomePrices", "[]"))
        clob_token_ids = self._parse_json_field(data.get("clobTokenIds", "[]"))

        outcome_prices = [float(p) for p in outcome_prices] if outcome_prices else []

        market = await session.get(Market, market_id)

        if not market:
            market = Market(
                id=market_id,
                source=SOURCE,
                event_id=event_id,
                question=data.get("question", ""),
                end_date=self._parse_end_date(data),
                condition_id=data.get("conditionId"),
                clob_token_ids=clob_token_ids,
                outcomes=outcomes,
                outcome_prices=outcome_prices,
                volume=float(data.get("volumeNum", 0) or 0),
                liquidity=float(data.get("liquidityNum", 0) or 0),
                active=data.get("active", True),
                closed=data.get("closed", False),
            )
            session.add(market)
        else:
            market.outcome_prices = outcome_prices
            market.volume = float(data.get("volumeNum", 0) or 0)
            market.liquidity = float(data.get("liquidityNum", 0) or 0)
            market.active = data.get("active", market.active)
            market.closed = data.get("closed", market.closed)
            market.last_updated = datetime.now(UTC)

        if outcome_prices:
            snapshot = Snapshot(
                market_id=market_id,
                yes_price=outcome_prices[0] if len(outcome_prices) > 0 else None,
                no_price=outcome_prices[1] if len(outcome_prices) > 1 else None,
                volume=float(data.get("volumeNum", 0) or 0),
                liquidity=float(data.get("liquidityNum", 0) or 0),
            )
            session.add(snapshot)

    @staticmethod
    def _parse_json_field(value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return []
        return value if value else []
