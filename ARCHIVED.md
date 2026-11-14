# Archived

Arbiter was a prediction-market opportunity scanner. It collected events and markets from Polymarket and Kalshi on a schedule, matched the same real-world events across the two exchanges, and surfaced arbitrage and mispricing opportunities. It was archived on 2026-11-14; it had not run since March 2026 and nothing replaced it. The final data snapshot is attached to the release tagged `archive-2026-11-14` as `arbiter.db`, a SQLite database of about 560 MB holding 12,651 events, 90,162 markets, 3.2 million price snapshots and 3,848 opportunities.

To bring it back:

```sh
git clone https://github.com/LoganJonesDevelopment/arbiter.git && cd arbiter
gh release download archive-2026-11-14 --pattern arbiter.db
docker compose up --no-start
docker run --rm -v arbiter_backend-data:/data -v "$PWD":/in alpine cp /in/arbiter.db /data/arbiter.db
docker compose up -d
```
