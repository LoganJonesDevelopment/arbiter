# Arbiter — Prediction Market Opportunity Scanner

## Overview
Scans Polymarket and Kalshi for arbitrage and mispricing opportunities. Matches events across exchanges and identifies cross-exchange arbs, multi-outcome arbs, and tailing opportunities.

## Architecture
- **Backend:** Python 3.12+, FastAPI, SQLAlchemy + SQLite (WAL mode), httpx, APScheduler
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4
- **Deployment:** Docker Compose (backend :8890, frontend :8889)
- **Data sources:** Polymarket Gamma API, Kalshi Events API (both no auth for reads)

## Opportunity Types
1. **Multi-outcome arb** — events with multiple markets where YES prices don't sum to 1.00
2. **Tailing** — near-certain outcomes (>95%) with remaining edge
3. **Cross-exchange arb** — same event priced differently on Polymarket vs Kalshi

## Fee Models
Centralized in `backend/arbiter/fees.py`:
- **Polymarket:** `fee_rate * (1.0 - price)` — 2% on profit, NOT flat 2¢
- **Kalshi:** `0.07 * price * (1 - price)` — quadratic, peaks at 50/50 (~1.75¢)

## Key Files
- `backend/arbiter/main.py` — FastAPI app, scheduler, scan orchestration
- `backend/arbiter/polymarket.py` — Polymarket data collector
- `backend/arbiter/kalshi.py` — Kalshi data collector
- `backend/arbiter/matching.py` — Event matching (Jaccard) + cross-exchange arb detection
- `backend/arbiter/analyzers.py` — Multi-outcome + tailing analysis
- `backend/arbiter/fees.py` — Fee calculations (single source of truth)
- `backend/arbiter/models.py` — SQLAlchemy models (Event, Market, Snapshot, Opportunity, EventMatch)
- `backend/arbiter/routes.py` — API endpoints
- `frontend/src/App.tsx` — Main UI with table view, filters, sorting
- `frontend/src/components/OpportunityTable.tsx` — Data table with sortable columns
- `frontend/src/components/DetailPanel.tsx` — Split-view detail panel

## Running
```bash
docker compose up -d --build
```
- Frontend: http://localhost:8889
- Backend API: http://localhost:8890/api

## Scan Cycle
Runs every N minutes (configurable via `COLLECTION_INTERVAL_MINUTES`):
1. Collect Polymarket events/markets
2. Collect Kalshi events/markets
3. Run analyzers (multi-outcome, tailing)
4. Match events across exchanges (Jaccard on titles)
5. Find cross-exchange arbs
6. Prune snapshots older than 48h
