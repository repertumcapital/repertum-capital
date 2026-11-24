# Research analyses

`research-posts.json` lists every analysis shown on the Research page (newest first, sorted by `date`).
PDFs go into the `research/` folder at the repo root.

## Adding an analysis

1. Upload the PDF to `research/`, e.g. `research/2026-11-20-sap.pdf`.
2. Add an entry to the array in `research-posts.json`:

```json
{
  "id": "2026-11-20-sap",
  "title": "SAP: cloud transition and margins",
  "date": "2026-11-20",
  "ticker": "SAP",
  "author": "Timo Held",
  "positionHeld": true,
  "positionNote": "Bought on 2026-11-10, see Trading Log.",
  "category": "Equity Research",
  "excerpt": "One or two sentences on what the analysis covers.",
  "pdf": "research/2026-11-20-sap.pdf",
  "tags": ["Technology", "Europe"],
  "facts": [
    { "type": "paragraph", "text": "Reported figures and events, with sources." }
  ],
  "opinion": [
    { "type": "paragraph", "text": "My personal assessment." }
  ]
}
```

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique, used in the URL (`research-post.html?id=...`). Letters, digits, dashes. |
| `title` | yes | |
| `date` | yes | `YYYY-MM-DD`. Optional `updated` for revisions. |
| `ticker` | yes | |
| `positionHeld` | yes | `true` or `false`. Shown as "Position held: Yes/No". If missing, the page shows "not stated" in red. |
| `author` | no | Defaults to "Timo Held". |
| `positionNote` | no | Short extra detail on the position. |
| `pdf` | no | Path to the PDF. Either `pdf` or text (`facts`/`opinion`) is needed. |
| `facts`, `opinion` | no | Text blocks shown under "Facts" and "My opinion". Block types: `paragraph`, `heading2`, `heading3`, `quote`, `list` (with `items`). |
| `content` | no | Free-form blocks shown before the facts. |
| `excerpt`, `category`, `tags`, `image` | no | |

Wording rules: no "buy now", "strong buy", price targets presented as advice, or return promises.

# Trade data and metrics

All trade numbers come from the published Google Sheet (`data-config.js` → `csvUrl`).
`trade-data.js` is the only file that fetches, parses and calculates them. Pages only display the results.

## Loading and caching

- The CSV is downloaded once and reused by every page for 10 minutes (`cacheMinutes`, stored in the browser's session storage). All pages of a visit therefore show the same version.
- "As of" on each page is the time this version was downloaded. Google Finance prices inside the sheet can be delayed by up to 20 minutes, and Google can take a few minutes to update the published CSV after a change.

## Parsing

- Columns are found by their header name (`Datum Einstieg`, `Datum Ausstieg`, `Ticker`, `Name`, `Current Price`, `Side (Long/Short)`, `Stück`, `Entry Price`, `Exit Price`, `P&L %`, `Holding Period (Tage)`, `Currency`, `FX Entry`, `FX Exit/Current`), so the column order can change.
- `Currency` is the currency of Entry, Exit and Current Price (`EUR`, `USD`, …). Without this column every trade is treated as EUR and the page shows a warning.
- `FX Entry` and `FX Exit/Current` are EUR per 1 unit of the trade currency, on the entry date and on the exit date (closed) or today (open). They are only needed for non-EUR trades; if one is missing the trade is excluded and listed as an error.
- Numbers must be in German format: `1.234,56`, `952,89`, `25,10%`. English formats like `1,234.56` are rejected instead of guessed.
- Dates must be `24.11.2026` (or ISO `2026-11-24`). An empty exit date means the trade is open.
- `#N/A`, `#REF!`, `#VALUE!`, empty cells, `-` and "Loading..." are errors, never 0. A trade with an error in a cell it needs is shown with "n/a", excluded from all totals, and listed in a visible notice on the page.
- The sheet's own `P&L %` is compared with the local return, and `Holding Period` with the calculated days; both are only used as a cross-check. A difference of more than 0.05 percentage points (or any day difference) is shown as a warning.

## Formulas

| Metric | Formula |
|---|---|
| Price *P* of a trade | exit price if closed, current price if open |
| Local return (trade currency, cross-check only) | long: (*P* − entry) ÷ entry × 100 · short: (entry − *P*) ÷ entry × 100 |
| Cost per trade in EUR (internal, never shown) | entry × FX entry × shares |
| P&L per trade in EUR (internal, never shown) | long: (*P* × FX now − entry × FX entry) × shares · short: (entry × FX entry − *P* × FX now) × shares |
| Return per trade (shown) | P&L in EUR ÷ cost in EUR × 100. Same as the local return for EUR trades; includes the currency effect otherwise |
| Total return since start | Σ P&L in EUR of all valid trades ÷ start capital (`data-config.js`) × 100 |
| Return on open positions | Σ P&L in EUR of open trades ÷ Σ cost in EUR of open trades × 100 |
| Win rate | closed trades with return in EUR > 0 ÷ all valid closed trades × 100 (shorts count as wins when the price fell) |
| Days held | exit date − entry date (open trades: download date − entry date) |
| Average holding period | mean of days held over closed trades |
| Start date | earliest entry date |
| Benchmark return | (last close − first close on/after start date) ÷ that close × 100, MSCI World ETF `EUNL.DE` |
| Difference vs benchmark | total return − benchmark return, in percentage points |

If the benchmark cannot be loaded it is shown as "n/a", never as 0%.

## Tests

`node --test tests/trade-data.test.js` checks parsing, error handling and every formula with made-up trades.
