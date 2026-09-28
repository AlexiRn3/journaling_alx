# ALX · Trading log

Public trading journal of a Tradeify 50K account (MNQ futures): equity curve, journal (calendar, cards,
timeline), a page per trade, statistics and the trading approach. A local admin imports trades from
Tradesea and completes them (screenshots, write-up, stop).

```bash
npm install
npm run dev      # http://localhost:3000 · admin at http://localhost:3000/admin
npm test         # import pipeline tests
npm run build    # static public site (the admin is not included)
```

## Publishing new trades

1. `npm run dev`, open `/admin`.
2. In Tradesea Compass, copy the "Recent Trades" table and paste it into the import card.
   Check the preview (merged partial exits, recomputed signs, re-entries and flips, duplicates), then import.
3. Open a trade with "Complete →": add the TradingView screenshots, the write-up (Markdown), the real stop if you know it.
4. Commit and push `data/trades.json` and `public/shots/`. The public site is rebuilt from them.

The admin only runs locally: in a production build `/admin` and its API return 404
(set `ALX_ADMIN=1` to override, e.g. on a private machine).

## Where things are

- Data: `data/trades.json` (trades, rules, update time) and `data/strategy.json` (texts of the Strategy page:
  replace the `[bracketed]` placeholders).
- Screenshots: `public/shots/`.
- Figures: `src/lib/calc.ts` (every stat, in R, $, points or %), import pipeline: `src/lib/import/`.
- Spec and mockups: `docs/maquette/` (start with `plan/PLAN.md`). Conventions for contributors: `AGENTS.md`.

## Deploying

Any Next.js host works (Vercel: import the repository, no settings needed). Every push rebuilds the site
from the JSON files.
