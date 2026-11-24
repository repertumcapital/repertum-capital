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

The site reads two published tabs of the Google Sheet (links in `data-config.js`):

- **Trade log** (`tradesCsvUrl`): one row per trade.
- **Public** (`publicCsvUrl`): the time-weighted return and the benchmark, as percentages only.

`trade-data.js` is the only file that fetches, parses and calculates them. Pages only display the results.
No money amounts or position sizes are read, stored or shown; this repository is public.

## Loading and caching

- Both CSVs are downloaded once and reused by every page for 10 minutes (`cacheMinutes`, session storage), so all pages of a visit show the same version.
- "Trade data as of" is the download time. "Performance as of" is the `As of` date in the Public tab.
- Google Finance prices can be delayed by up to 20 minutes, and Google can take a few minutes to update a published CSV.

## Public tab

Two columns, `Metric` | `Value`. Labels are matched case-insensitively; other rows (notes) are ignored.

| Label | Value |
|---|---|
| `Inception date` | date, `21.01.2025` |
| `As of` | date the returns run to |
| `Time-weighted return since inception` | cumulative, formatted with `%` |
| `Time-weighted return year-to-date` | cumulative, with `%` |
| `Benchmark` | text, e.g. `MSCI World (EUNL)` |
| `Benchmark return since inception` | same period as the TWR, with `%` |
| `Benchmark return year-to-date` | with `%` |

A percentage without `%` (e.g. `0,2735`), an error cell or a missing row is shown as an error and the value as "n/a".

## Trade log columns

Columns are found by header name, so the order can change: `Datum Einstieg`, `Datum Ausstieg`, `Ticker`, `Name`, `Current Price`, `Side (Long/Short)`, `Entry Price`, `Exit Price`, `Currency`, `FX Entry`, `FX Exit/Current`; optional cross-checks `P&L %` and `Holding Period (Tage)`. Share counts and € P&L are not needed and should not be in the published tab.

- Numbers in German format (`1.234,56`, `25,10%`); English formats are rejected, not guessed. Dates `24.11.2026` (or ISO). Empty exit date = open trade.
- `#N/A`, `#REF!`, empty cells, `-` and "Loading..." are errors, never 0. A trade with an error in a cell it needs shows "n/a", is excluded from the trade statistics and is listed in a notice on the page.
- A missing entry date only produces a warning; the trade is left out of days held.
- `Currency` = currency of Entry, Exit and Current Price. Without the column every trade counts as EUR (with a warning).
- `FX Entry` / `FX Exit/Current` = EUR per 1 unit of the trade currency, on the entry date and on the exit date (closed) or today (open). Only needed for non-EUR trades.
- `GBX`/`GBp` = prices in pence; FX columns are then EUR per 1 GBP.
- The sheet's `P&L %` is compared with the local return and `Holding Period` with the calculated days; differences are shown as warnings.

## Formulas

| Metric | Formula | Where |
|---|---|---|
| Time-weighted return (since inception, YTD) | chain-linked monthly returns, see the Performance tab | sheet |
| Benchmark return | same period as the TWR | sheet |
| Annualized return | ((1 + r) ^ (365.25 ÷ days) − 1) × 100, only if inception → as-of ≥ 365 days; otherwise not shown | site |
| Difference vs benchmark | TWR − benchmark, in percentage points | site |
| Price *P* of a trade | exit price if closed, current price if open | site |
| Local return (cross-check) | long (*P* − E) ÷ E × 100 · short (E − *P*) ÷ E × 100 | site |
| Return per trade (shown) | long (*P* × FX now − E × FX entry) ÷ (E × FX entry) × 100 · short (E × FX entry − *P* × FX now) ÷ (E × FX entry) × 100 | site |
| Win rate | closed trades with return > 0 ÷ all valid closed trades × 100 (shorts win when the price fell) | site |
| Days held | exit − entry (open trades: download date − entry) | site |
| Average holding period | mean days held over closed trades | site |

## Tests

`node --test tests/trade-data.test.js` checks parsing, error handling and every site-side formula with made-up data.
