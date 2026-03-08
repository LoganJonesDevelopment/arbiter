# Arbiter Roadmap

## Phase 1 — Foundation (DONE)
- [x] Polymarket Gamma API collector (all active events/markets)
- [x] SQLite storage with price snapshots
- [x] Multi-outcome arb detector (neg-risk sum-to-one violations)
- [x] Tailing detector (near-certain markets >95%)
- [x] FastAPI backend with scheduled scanning (5 min)
- [x] React dashboard with stats, opportunity table, event detail

## Phase 2 — Make It Useful (DONE)

### Analysis
- [x] Edge quality scoring (high/medium/low/theoretical) based on liquidity, fees, executability
- [x] Fee-adjusted returns — subtract Polymarket's 2% fee from theoretical edge
- [x] Tailing with momentum — compare snapshots to detect surging/drifting/pulling back
- [x] Completeness detection — flag multi-outcome events with placeholder markets as non-arbs
- [x] Resolved-event filtering — skip near-zero price sums (settled but not deactivated)
- [x] Practical leg cap — events with >20 legs demoted to theoretical
- [x] Overpriced/shorting penalty — overpriced direction requires shorting, marked theoretical
- [x] Scan lock — prevent concurrent scans from colliding on SQLite
- [ ] Annualized return calc — factor in time-to-resolution
- [ ] Volume anomaly detection — flag unusual volume spikes

### UI
- [x] Quality filter cards (high/medium/low/theoretical) with click-to-filter
- [x] Opportunity cards with trade descriptions, fee breakdowns, profit estimates
- [x] Completeness badges — "X unlisted slots" or "complete" per event
- [x] Polymarket verification links on each opportunity
- [x] Type filters (All / Multi-Outcome / Tailing) and hide-theoretical toggle
- [x] Momentum indicators and thin-liquidity warnings
- [ ] Price history charts (sparklines, data is collected)
- [ ] New opportunity alerts
- [ ] Watchlist

### Key Finding
Single-exchange multi-outcome arbs on Polymarket are effectively nonexistent:
- Events with placeholder markets create false "underpriced" signals
- Complete events are always overpriced (sum > 1.0, requires shorting)
- Tailing (buying near-certain outcomes) is the only actionable single-exchange play

## Phase 3 — Cross-Market Arbitrage
Priority: the highest-value feature. Same event priced differently on two platforms = guaranteed profit.

- [ ] Kalshi API integration
- [ ] Market matching (title similarity + date matching)
- [ ] Cross-platform arb detector
- [ ] Resolution risk warnings (different resolution criteria)
- [ ] Fee-adjusted cross-platform P&L

## Phase 4 — Correlated Market Intelligence
- [ ] Related market clustering
- [ ] Logical constraint detection (subset/superset relationships)
- [ ] Constraint violation scanner
- [ ] LLM-assisted relationship mapping

## Phase 5 — Observability & Trends
- [ ] Market creation feed
- [ ] Category dashboards
- [ ] Price movement heatmaps
- [ ] Resolution tracking
- [ ] Whale tracking

## Phase 6 — Infrastructure
- [ ] Docker Compose
- [ ] WebSocket real-time feed
- [ ] Notification system
- [ ] Historical analytics / backtesting
