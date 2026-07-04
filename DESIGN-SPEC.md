# Arbiter Design Spec — Trading-Grade Dashboard

Desktop-only monitoring tool for one person. Optimize for information density and scannability, not aesthetics. Every pixel should communicate data.

---

## 1. Design Philosophy

**Core principle: maximize the data-ink ratio.** Every visual element must either display data or help you scan data faster. If it does neither, remove it.

Three rules borrowed from professional trading UIs:

1. **The interface should get out of the way.** The markets are the content. The UI is the frame. Bloomberg, TradingView, and Deribit all share this — the chrome is minimal and the data fills the viewport.
2. **Density over whitespace.** This is not a marketing page. Consumer-app spacing (24px padding, 16px gaps) wastes screen real estate. Trading terminals pack data tight with discipline, not chaos.
3. **Hierarchy through typography and color, not layout.** Bloomberg doesn't use cards with rounded corners and drop shadows to separate content. It uses font weight, font size, and color to create visual layers on a flat surface.

**Anti-patterns to actively avoid:**
- Card-heavy layouts with large padding and rounded corners (consumer app aesthetic)
- Neon/saturated accent colors on dark backgrounds (crypto-bro aesthetic)
- Excessive badges and pills competing for attention
- Zebra striping on tables with interactive states (conflicts with hover/selected states)
- Equal visual weight for all data (when everything is bold, nothing is)
- Gratuitous animations or transitions (delay perception of data updates)
- Repeating contextual info in every row (put it in column headers)

---

## 2. Color System

### Background Surfaces (dark, low-saturation, slight blue tint)

| Token | Hex | Usage |
|---|---|---|
| `surface` | `#0a0e14` | Page background |
| `panel` | `#0d1117` | Primary content areas |
| `panel-raised` | `#151b23` | Elevated panels, dropdowns, popovers |
| `panel-inset` | `#010409` | Inset/sunken areas (input fields, code blocks) |

Rationale: Pure black (#000) is harsh. The slight blue undertone (matching GitHub Dark) reduces eye strain during extended monitoring. Material Design recommends `#121212` minimum; this palette sits in that range with more character.

### Borders

| Token | Hex | Usage |
|---|---|---|
| `border` | `#21262d` | Default borders, dividers |
| `border-emphasis` | `#30363d` | Hover states, active elements |

Use 1px solid borders only. No box-shadows for elevation — use border color shifts instead. Drop shadows don't work on near-black backgrounds.

### Text

| Token | Hex | Contrast vs surface | Usage |
|---|---|---|---|
| `text-primary` | `#e6edf3` | 15.4:1 | Primary content, values you need to read |
| `text-secondary` | `#8b949e` | 6.2:1 | Labels, metadata, secondary info |
| `text-tertiary` | `#484f58` | 3.3:1 | Disabled, decorative, timestamps |
| `text-link` | `#58a6ff` | 7.1:1 | Clickable text |

### Semantic Colors (muted, not neon)

| Token | Hex | Usage |
|---|---|---|
| `positive` | `#3fb950` | Profit, good edge, executable opportunities |
| `positive-muted` | `#238636` | Positive backgrounds, subtle indicators |
| `negative` | `#f85149` | Loss, bad edge, warnings |
| `negative-muted` | `#da3633` | Negative backgrounds |
| `caution` | `#d29922` | Medium quality, needs attention |
| `caution-muted` | `#9e6a03` | Caution backgrounds |
| `accent` | `#6e7681` | Neutral emphasis |

Why these specific values: They're desaturated compared to Tailwind defaults. Bloomberg uses amber (#FFA028) as its primary accent but that's for its black background — on near-black with blue tint, these GitHub-adjacent semantics maintain readability without the "gaming dashboard" feel. The positive green is visible but not radioactive. The red is warm, not alarming.

### Platform Colors

| Token | Hex | Usage |
|---|---|---|
| `polymarket` | `#6366f1` | Polymarket-sourced data (indigo, matches their brand) |
| `kalshi` | `#06b6d4` | Kalshi-sourced data (cyan) |

Use at 100% opacity for text labels, 15% opacity for background tints on badges.

---

## 3. Typography

### Font Stack

```css
/* UI text (labels, descriptions, navigation) */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;

/* Numerical data (prices, percentages, volumes, edges) */
font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
```

Inter + JetBrains Mono is the pairing to use. They share nearly identical x-heights, so they sit together naturally. Inter has OpenType tabular figures for inline numbers. JetBrains Mono makes numerical columns scannable because every digit occupies the same width — `$1,111.11` and `$999.99` visually align.

**Do not use a single monospace font for everything.** Monospace hurts readability on titles and descriptions — monospace fonts are wider and slower to read for prose. Use monospace exclusively for data.

### Type Scale

| Role | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Page title | Inter | 14px | 600 | -0.01em |
| Section header | Inter | 12px | 600 | 0.02em, uppercase |
| Column header | Inter | 11px | 500 | 0.04em, uppercase |
| Body text (titles, descriptions) | Inter | 13px | 400 | 0 |
| Primary data (edge %, price) | JetBrains Mono | 13px | 700 | 0 |
| Secondary data (volume, liquidity) | JetBrains Mono | 11px | 400 | 0 |
| Tertiary data (timestamps, labels) | Inter | 10px | 400 | 0.02em |
| Badge text | Inter | 10px | 600 | 0.04em, uppercase |

Key constraint: nothing below 10px. At 10px on a standard density display, readability drops fast.

### Number Formatting

- Always use `tabular-nums` (OpenType feature `tnum`) for any number that appears in a column
- Right-align all numerical columns
- Use monospace font for all numbers in data views
- Currency: `$1,234.56` — always two decimal places, comma thousands separator
- Percentages: `2.34%` — always two decimal places
- Prices in cents: `95.1c` — one decimal place
- Large numbers: `$1.2M`, `$45.3K` — one decimal place with suffix
- Negative numbers: prefix with minus, color red. Never use parenthetical accounting notation.

---

## 4. Layout System

### Spacing Scale

Use a 4px base grid. All spacing should be multiples of 4px.

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Inline gaps, tight element spacing |
| `space-2` | 8px | Default gap between related elements |
| `space-3` | 12px | Cell padding, section gaps |
| `space-4` | 16px | Panel padding, major section gaps |
| `space-6` | 24px | Page margins |

### Page Structure

```
+--------------------------------------------------------------+
| HEADER: logo, status, scan control                    h: 40px |
+--------------------------------------------------------------+
| STAT BAR: quality counts as inline chips, not cards    h: 32px |
+--------------------------------------------------------------+
| FILTER BAR: type toggles, sort, filter controls        h: 32px |
+--------------------------------------------------------------+
| DATA TABLE: the main event, fills remaining viewport          |
|                                                               |
|  [col headers - sticky]                                       |
|  row row row row row row row row row row row row              |
|  row row row row row row row row row row row row              |
|  row row row row row row row row row row row row              |
|                                                               |
+--------------------------------------------------------------+
```

The header, stat bar, and filter bar should be fixed/sticky. Combined height: ~104px. The remaining viewport is 100% data table. On a 1080p display, that's ~970px of data. At 32px row height, that's ~30 visible rows without scrolling.

---

## 5. Data Table Design

The main view is a dense data table, not cards.

### Row Structure

```
| Quality | Type | Title                          | Edge    | Net Edge | Profit  | Volume  | Liquidity | Seen  |
| [bar]   | TAIL | Will Bitcoin hit $100K by...    | 3.21%   | 1.21%    | $1.21   | $45.3K  | $12.1K    | 2h    |
```

### Column Specifications

| Column | Width | Align | Font | Content |
|---|---|---|---|---|
| Quality indicator | 3px | — | — | Colored vertical bar (no text) |
| Type | 48px | left | Inter 10px 600 | `MULTI` `TAIL` `CROSS` pill |
| Source | 40px | left | Inter 10px 600 | `POLY` `KALSHI` pill |
| Title | flex (fill) | left | Inter 13px 400 | Event/market title, truncate with ellipsis |
| Raw Edge | 64px | right | JetBrains Mono 11px 400 | `3.21%` in secondary color |
| Net Edge | 72px | right | JetBrains Mono 13px 700 | `1.21%` colored by value |
| Est. Profit | 64px | right | JetBrains Mono 11px 400 | `$1.21/100` |
| Volume | 64px | right | JetBrains Mono 11px 400 | `$45.3K` |
| Liquidity | 64px | right | JetBrains Mono 11px 400 | `$12.1K` with warning color if thin |
| Age | 40px | right | Inter 10px 400 | `2h`, `3d` |
| Link | 24px | center | — | External link icon |

### Row Behavior

- **Height:** 32px (compact). Enough for single-line content with 8px vertical padding.
- **Hover:** Background shifts to `panel-raised` (#151b23). Entire row is clickable to open detail view.
- **Active/Selected:** Left border thickens to 2px in quality color. Background tints slightly with quality color at 5% opacity.
- **Dividers:** 1px solid `border` (#21262d) between rows. No zebra striping.
- **Sticky header:** Column headers stay fixed during scroll.
- **Sorting:** Click column headers to sort. Active sort column shows a small chevron (up/down). Default sort: net edge descending.
- **Quality bar:** 3px wide vertical bar on the left edge of each row. Colors: green (high), yellow (medium), orange (low), transparent (theoretical).
- **Non-executable rows:** Reduce opacity to 0.4. Don't hide them — the count matters for context.

### Why Tables Beat Cards Here

Cards are good when:
- Each item has variable-height content
- Items have distinct visual structures
- You're browsing, not scanning
- Mobile layout is a concern

Tables are good when:
- You need to compare the same fields across many items
- Sorting and filtering are primary interactions
- You need to scan one dimension (e.g., edge %) across all rows at a glance
- Density matters
- Desktop only

Arbiter is the second case. A card layout forces your eyes to hunt for the edge value in each card individually. A table puts all edges in a single column, scannable in a glance.

---

## 6. Stat Bar

Quality counts render as an inline chip bar, not a card grid:

```
HIGH 3  |  MED 12  |  LOW 8  |  THEO 45  ·  hiding 45 theoretical
```

- Each chip: text-only, no background, no border. Just the label in the quality color + the count in primary text.
- Active filter: underline + slightly brighter text.
- Total height: 32px (single line).

---

## 7. Filter & Sort Bar

Single row, 32px height:

```
[ALL 68] [MULTI 12] [TAIL 45] [CROSS 11]     Sort: Edge v  |  [ ] Hide theoretical  |  Showing 23/68
```

- Type filters: text buttons with count, no background in default state. Active state: subtle bottom border or text color change.
- Sort dropdown or clickable column headers (prefer column headers — one less control element).
- Hide theoretical: checkbox + label, right-aligned.
- Result count: right-aligned, tertiary text.

---

## 8. Detail View (Event Drilldown)

When you click a row, expand inline or slide in a right panel (not a full page navigation — you lose table context).

**Preferred: split view.** Table stays on the left (narrowed), detail panel opens on the right. This lets you click through rows without losing your place. TradingView and Deribit both use this pattern. Bloomberg uses it pervasively.

Detail panel contents:
- Event title (13px, semibold)
- Platform links (Polymarket, Kalshi)
- Price sum bar with deviation indicator
- Market list: compact table within the panel
  - Market question | YES price | NO price | Volume | Liquidity
- Trade description box (inset background)
- Relevant badges (momentum, completeness, thin liquidity)

---

## 9. Status & Metadata

### Header (40px)

```
ARBITER                                    scan 2m ago  |  refresh 14s ago  |  [SCAN]
Prediction Market Scanner   POLY 1,247  KALSHI 892  |  423 mkts
```

- Logo: `ARBITER` in Inter 14px 600, primary text color. No icon.
- Subtitle: 10px uppercase tracking-widest, tertiary text.
- Stats: inline, separated by pipes, tertiary text.
- Scan indicator: 6px circle, green when recent (<10m), yellow when stale (10-30m), red when old (>30m). Subtle pulse animation on green only.
- Scan button: ghost button (border only), accent color. No fill — it's a secondary action.

---

## 10. Interaction Patterns

### Keyboard Navigation

- `j`/`k` or arrow keys: move selection up/down in table
- `Enter`: open detail view for selected row
- `Escape`: close detail view
- `1-4`: toggle quality filters
- `f`: focus search/filter input (future)
- `r`: trigger scan refresh

### Sorting

- Click column header to sort ascending
- Click again for descending
- Third click removes sort (returns to default)
- Only one active sort column at a time
- Visual indicator: small monochrome chevron next to active sort column header

### Filtering

- Type filters are additive toggles (click MULTI to show only multi-outcome)
- Quality filters are additive toggles
- Both can be active simultaneously (intersection)
- Show result count: `23/68` — tells you how much is filtered

---

## 11. Responsive Behavior

This is desktop-only, but handle different desktop widths:

- **< 1200px:** Hide lowest-priority columns (Age, Raw Edge). Narrow padding.
- **1200-1920px:** Full table, standard spacing.
- **> 1920px:** Consider two-column layout (table left, detail right permanent).
- **Ultrawide (3440px+):** Three columns — secondary data table or chart alongside.

---

## 12. Performance Constraints

- Table must render 200+ rows without jank. Use virtualized scrolling (react-window or similar) if row count exceeds 100.
- Data refreshes every 30 seconds. Updates should be in-place (no full re-render flicker). Use stable keys and memoized rows.
- No loading spinners for data refresh — just update the "refresh Xs ago" indicator. Only show a loading state on initial page load.
- Animations: limit to opacity transitions (150ms) on hover states. No transforms, no layout shifts.

---

## 13. Implementation Notes (React + Tailwind)

### Tailwind Config

The `@theme` block in `index.css` defines the palette above plus the Inter + JetBrains Mono font stack.

### Key CSS Utilities

```css
.font-data { font-family: 'JetBrains Mono', monospace; }
.font-ui { font-family: 'Inter', system-ui, sans-serif; }
.tabular { font-variant-numeric: tabular-nums; }
```

### Component Structure

```
App
  Header (sticky)
  StatBar (sticky)
  FilterBar (sticky)
  SplitView
    OpportunityTable (left, scrollable)
      TableHeader (sticky within scroll)
      TableRow (virtualized)
    DetailPanel (right, conditional)
```

---

## 14. Reference Summary

What to steal from each reference:

| Source | Take This | Skip This |
|---|---|---|
| **Bloomberg Terminal** | Information density, flat layout (no cards), amber accent for primary data, monospace numbers, keyboard-driven | The actual black/amber palette (too stark), proprietary typography |
| **TradingView** | Split-view panel pattern, column-based data layout, dark theme surface hierarchy, theme token system | Chart-heavy focus, social features |
| **Deribit** | Modular panel layout, options-chain table density, configurable columns | Complexity of options-specific UI |
| **Binance Pro** | Dark neutral background (#1E2329 range), restrained accent colors, compact order book styling | Yellow brand color, mobile-first compromises |
| **Polymarket** | Card carousel for discovery browsing (not relevant here), color-coded probability | Over-simplified YES/NO interface, uniform market display |
| **AG Grid / MUI DataGrid** | 32px compact row height, 8px cell padding, sticky headers, column resize | Enterprise complexity, heavy bundle size |

---

## Sources

- [Pencil & Paper — Data Table UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Pencil & Paper — Dashboard UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Bloomberg — Designing the Terminal for Color Accessibility](https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility/)
- [Bloomberg Color Palette](https://www.color-hex.com/color-palette/111776)
- [Devexperts — UX/UI Design for Online Trading Platforms](https://devexperts.com/blog/ux-ui-design-for-online-trading-platforms/)
- [Devexperts — Trading Platform Design No-Nos](https://devexperts.com/blog/trading-platform-ux-ui-design-no-nos/)
- [Human Invariant — Novel Interface Designs for Prediction Markets](https://humaninvariant.substack.com/p/novel-interface-designs-for-prediction)
- [Paul Wallas — Designing for Data Density](https://paulwallas.medium.com/designing-for-data-density-what-most-ui-tutorials-wont-teach-you-091b3e9b51f4)
- [TradingView Custom Themes API](https://www.tradingview.com/charting-library-docs/latest/customization/styles/custom-themes/)
- [Four Zero Three — Scalable Accessible Dark Theme](https://www.fourzerothree.in/p/scalable-accessible-dark-mode)
- [AG Grid — Theming Compactness](https://www.ag-grid.com/javascript-data-grid/theming-compactness/)
- [MUI X DataGrid — Row Height](https://mui.com/x/react-data-grid/row-height/)
- [Inter Typeface](https://rsms.me/inter/)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- [Mobbin — Binance Brand Colors](https://mobbin.com/colors/brand/binance)
- [DesignRush — Dashboard Design Principles](https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles)
- [UXPin — Dashboard Design Principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
