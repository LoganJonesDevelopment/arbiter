import asyncio
from arbiter.polymarket import PolymarketCollector
from arbiter.db import init_db, async_session
from arbiter import analyzers


async def main():
    await init_db()
    print("DB initialized")
    async with async_session() as session:
        collector = PolymarketCollector()
        result = await collector.collect(session)
        print(f"Collection: {result}")
        analysis = await analyzers.run_all(session)
        print(f"Analysis: {analysis}")


asyncio.run(main())
