# Arbiter — Prediction Market Opportunity Scanner

## Overview
Scans Polymarket (and eventually other prediction markets) for arbitrage and mispricing opportunities.

## Architecture
- **Backend:** Python 3.12+, FastAPI, SQLAlchemy + SQLite, httpx
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
- **Data source:** Polymarket Gamma API (no auth), CLOB API (no auth for reads)

## Opportunity Types
1. **Multi-outcome arb** — events with multiple markets where YES prices don't sum to 1.00
2. **Tailing** — near-certain outcomes (>95%) with remaining edge
3. (Planned) Cross-market arb — same event priced differently across platforms
4. (Planned) Correlated mispricing — logically related markets violating probability constraints

## Key Polymarket API Details
- Gamma API: `https://gamma-api.polymarket.com` — market discovery, current prices
- CLOB API: `https://clob.polymarket.com` — order books, historical prices
- `outcomePrices` and `clobTokenIds` come as stringified JSON — need json.loads()
- `neg_risk: true` markets are multi-outcome (NegRisk adapter)
- Rate limits: Gamma 300-500/10s for listings, CLOB 1000-1500/10s for price data

## Running
```bash
# Backend
cd backend && pip install -r requirements.txt && python -m arbiter.main

# Frontend
cd frontend && npm install && npm run dev
```
