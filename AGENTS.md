<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ALX trading log · project conventions

Public trading journal (Tradeify 50K, MNQ futures) + a local-only admin. English UI only.
The spec is `docs/maquette/plan/PLAN.md`; the look is `docs/maquette/mockups/` (desktop 1440 px, mobile 390 px, admin).
Mockups are fixed-size HTML: rebuild them responsively, never copy their absolute positioning.

## Stack

- Next.js 16 App Router + TypeScript, React 19. No CSS framework: `src/app/globals.css` (tokens, helpers) + CSS Modules.
- Data lives in JSON files, versioned in git: `data/trades.json` (meta, rules, trades with editorial fields), `data/strategy.json`.
  Server code reads them through `src/lib/data.ts`. The admin (`/admin`) writes them; it only runs with `next dev`.
- Timestamps are naive ET strings (`2026-09-27T19:44:34`). Use `src/lib/dates.ts`, never `new Date(str)` / local time zones.

## Shared building blocks (reuse, don't duplicate)

- `src/lib/calc.ts`: every figure (overview, equity, drawdown, breakdowns, session days, slugs, period filter).
  All values follow the visitor's unit via `tradeValue(t, unit)`. BE = |net| ≤ $30, excluded from the win rate.
- `src/lib/format.ts`: `fmtValue(v, unit, { est, compact })`, `fmtMoney`, `fmtPrice`, `fmtHold`, `fmtRate`, `signClass`, `resultClass`, `resultMark`…
  Gains and losses always show their sign (U+2212 minus) and colour: `.g` / `.l` / `.be` for text, `--gm` / `--lm` / `--bm` for marks.
- `src/components/site/prefs.tsx`: `usePrefs()` → `{ unit, period, setUnit, setPeriod, today, ready }`, `usePeriodTrades(trades)`.
- `src/components/site/transitions.tsx`: `<PageTransition>` (wrap every page's content), `swap(fn)` (cross-fade a state change).
- `src/components/ui/Seg.tsx` (segmented control with sliding pill), `src/components/ui/Val.tsx` (a signed value).
- `src/components/charts/EquityChart.tsx` (+ `EquityLegend`), `src/components/trade/TradeCard.tsx`, `MiniSchema.tsx`.
- Global helpers in `globals.css`: `.wrap` (1200 px column), `.mono`, `.k` (mono caps label), `.h1/.h2/.h3`, `.sub`, `.shot`, `.chip`, `.btn`, `.ib`, `.plain`, `.trk/.pos/.neg`, `.fade-in/.rise-in/.pop-in`, `.sr-only`.

## Layout

- `src/app/(site)/layout.tsx` renders the sticky top bar (56 px), the page, the footer and the bottom menu (fixed, 64 px).
  Pages render only their content, inside `<PageTransition>`, starting with `<div className="wrap">`.
- Breakpoint: mobile below 720 px (`@media (max-width: 719px)`). Touch targets ≥ 44 px.
- Page top spacing: 72 px under the bar on desktop, 24 px on mobile.

## Motion (only to smooth clicks and page changes)

- Navigations animate by themselves (React `<ViewTransition>`). Use `next/link`; add `transitionTypes={["nav-forward"]}` or `["nav-back"]` for previous / next.
- Wrap in-page state changes that swap content in `swap(() => setX(...))` (unit, view, filters, selected day).
- Durations 120–240 ms, `var(--ease)`, no bounce, no parallax. Respect `prefers-reduced-motion` (globals already does).

## Admin and import

- `/admin` (list + import) and `/admin/trades/[id]` (edit) run with `next dev` only (`adminEnabled()`), API under `src/app/api/admin/`.
- Import pipeline: `src/lib/import/` (paste parser, CSV orders parser, merge, derived fields, edits). Tests: `npm test`.
- To try the admin without touching the real data: `ALX_DATA_DIR=<copy of data/> npx next dev`.

## Checks

- `npx tsc --noEmit`, `npm test`, then look at the page: several dev servers can share the repo with
  `NEXT_DIST_DIR=.next-<name> npx next dev -p <port>` (revert the include lines `next dev` adds to tsconfig.json).
