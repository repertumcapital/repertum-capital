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
