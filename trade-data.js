/*
 * trade-data.js – the ONE data module of the site.
 *
 * Responsibilities (nothing else on the site may do these):
 *   1. Fetch the two published Google Sheet CSVs – the trade log and the
 *      "Public" performance tab – once per browser session (see CACHE).
 *   2. Parse it explicitly (German number and date formats, error cells).
 *   3. Calculate every metric. Formulas are documented in data/README.md.
 *   4. Format numbers, percentages and dates for display.
 *
 * Pages only read `trades`, `metrics`, `performance` and `issues` and put
 * them into the DOM. No money amounts or position sizes are used anywhere.
 */
(function (root) {
  "use strict";

  /* ─── CONFIG ──────────────────────────────────────────────────────────── */

  const config = root.SITE_DATA_CONFIG || {};
  const sheetConfig = config.googleSheet || {};
  const tradesCsvUrl = sheetConfig.tradesCsvUrl || sheetConfig.csvUrl;
  const publicCsvUrl = sheetConfig.publicCsvUrl;

  const CACHE_KEY = "rc-trade-snapshot-v3";
  const CACHE_TTL_MS = ((config.googleSheet && config.googleSheet.cacheMinutes) || 10) * 60 * 1000;

  // Sheet header → internal field. Columns are found by header name, so
  // reordering columns in the sheet does not break the site.
  const COLUMNS = {
    entryDate: ["Datum Einstieg", "Entry Date"],
    exitDate: ["Datum Ausstieg", "Exit Date"],
    ticker: ["Ticker"],
    name: ["Name"],
    currentPrice: ["Current Price", "Aktueller Kurs"],
    side: ["Side (Long/Short)", "Side"],
    entryPrice: ["Entry Price"],
    exitPrice: ["Exit Price"],
    sheetReturnPct: ["P&L %"],
    sheetHoldingDays: ["Holding Period (Tage)", "Holding Period (Days)"],
    // Currency of Entry/Exit/Current Price (e.g. EUR, USD). Optional column;
    // without it every trade is treated as EUR and a warning is shown.
    currency: ["Currency", "Währung"],
    // EUR per 1 unit of the trade currency. Only needed for non-EUR trades.
    fxEntry: ["FX Entry", "FX at Entry"],
    fxNow: ["FX Exit/Current", "FX Current", "FX Exit"]
  };
  const BASE_CURRENCY = "EUR";
  const REQUIRED_COLUMNS = ["entryDate", "exitDate", "ticker", "side", "entryPrice", "exitPrice", "currentPrice"];

  // "Public" tab: column A = label, column B = value. Labels are matched
  // case-insensitively; other rows (e.g. notes) are ignored.
  const PUBLIC_FIELDS = {
    inceptionDate: { label: "Inception date", type: "date" },
    asOf: { label: "As of", type: "date" },
    twrSinceInception: { label: "Time-weighted return since inception", type: "percent" },
    twrYtd: { label: "Time-weighted return year-to-date", type: "percent" },
    benchmarkName: { label: "Benchmark", type: "text" },
    benchmarkSinceInception: { label: "Benchmark return since inception", type: "percent" },
    benchmarkYtd: { label: "Benchmark return year-to-date", type: "percent" }
  };

  // A difference larger than this between the site's calculation and the
  // sheet's own P&L % column is reported as a data issue.
  const RETURN_TOLERANCE_PCT = 0.05;

  /* ─── PARSING ─────────────────────────────────────────────────────────── */

  // Result of every parse: { value, error }. `error` is null or a short text.
  function ok(value) { return { value, error: null }; }
  function fail(raw, reason) { return { value: NaN, error: reason, raw }; }

  /**
   * Parses a number exported by a German-locale Google Sheet.
   * Accepts: "952,89", "1.102,15", "-12,5", "25,10%", "€ 1.234,00", "100".
   * Rejects (returns an error, never a silent 0): "", "-", "#N/A", "#REF!",
   * "Loading...", English-formatted "1,102.15" and anything else ambiguous.
   */
  function parseNumber(raw) {
    const s = String(raw === undefined || raw === null ? "" : raw)
      .trim()
      .replace(/−/g, "-")       // Unicode minus
      .replace(/[\s €$%]/g, "");  // spaces, currency, percent sign

    if (s === "" || s === "-" || s === "—") return fail(raw, "empty");
    if (s.startsWith("#")) return fail(raw, s);                 // #N/A, #REF!, #VALUE!, #DIV/0!, #ERROR!
    if (/^loading/i.test(s)) return fail(raw, "still loading");

    // German format: optional minus, digits with optional "." thousands
    // groups, optional "," decimal part.
    if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return fail(raw, "unreadable number");

    const value = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(value) ? ok(value) : fail(raw, "unreadable number");
  }

  /**
   * Parses "24.11.2026" (also "4.1.2026" and ISO "2026-11-24").
   * Returns a Date at UTC midnight, so day differences are exact.
   */
  function parseDate(raw) {
    const s = String(raw === undefined || raw === null ? "" : raw).trim();
    if (s === "" || s === "-" || s === "—") return { value: null, error: null }; // empty is allowed (open trade)
    if (s.startsWith("#")) return { value: null, error: s, raw };

    let y, m, d;
    let match = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
    else if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +match[1]; m = +match[2]; d = +match[3]; }
    else return { value: null, error: "unreadable date", raw };

    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      return { value: null, error: "invalid date", raw };
    }
    return { value: date, error: null };
  }

  function csvToRows(text) {
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(current); current = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i++;
        row.push(current); rows.push(row); row = []; current = "";
      } else {
        current += char;
      }
    }
    if (current.length > 0 || row.length > 0) { row.push(current); rows.push(row); }

    return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
  }

  function mapHeader(headerRow) {
    const normalized = headerRow.map(h => String(h).trim().toLowerCase());
    const index = {};
    Object.keys(COLUMNS).forEach(field => {
      index[field] = -1;
      for (const name of COLUMNS[field]) {
        const i = normalized.indexOf(name.toLowerCase());
        if (i !== -1) { index[field] = i; break; }
      }
    });
    return index;
  }

  /* ─── CALCULATIONS (the only place metrics are computed) ──────────────── */

  const DAY_MS = 24 * 60 * 60 * 1000;

  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
  }

  /**
   * Builds one trade from a CSV row. Every number the site shows for a
   * trade is derived here from prices and dates; the sheet's own P&L
   * columns are only used as a cross-check.
   */
  function buildTrade(cols, col, rowNumber, asOf) {
    const cell = field => (col[field] >= 0 ? cols[col[field]] : "");
    const problems = [];

    const ticker = String(cell("ticker")).trim();
    const name = String(cell("name")).replace(/\s+/g, " ").trim(); // names may contain line breaks
    const label = ticker || `row ${rowNumber}`;

    const entryDate = parseDate(cell("entryDate"));
    const exitDate = parseDate(cell("exitDate"));
    // A missing entry date does not change the return, so the trade stays in
    // the totals; only its days held and the start date are affected.
    const dataWarnings = [];
    if (entryDate.error) problems.push(`Entry date: ${entryDate.error}`);
    else if (!entryDate.value) dataWarnings.push("entry date missing, so it is left out of days held");
    if (exitDate.error) problems.push(`Exit date: ${exitDate.error}`);

    const sideRaw = String(cell("side")).trim().toLowerCase();
    const side = sideRaw === "short" ? "Short" : sideRaw === "long" ? "Long" : null;
    if (!side) problems.push(`Side: "${cell("side")}" is neither Long nor Short`);
    const direction = side === "Short" ? -1 : 1;

    const isClosed = String(cell("exitDate")).trim() !== "";

    const entryPrice = parseNumber(cell("entryPrice"));
    const exitPrice = parseNumber(cell("exitPrice"));
    const currentPrice = parseNumber(cell("currentPrice"));

    if (entryPrice.error) problems.push(`Entry price: ${entryPrice.error}`);
    else if (entryPrice.value <= 0) problems.push("Entry price must be above 0");

    // Price used for the return: exit price if closed, current price if open.
    const price = isClosed ? exitPrice : currentPrice;
    if (price.error) problems.push(`${isClosed ? "Exit" : "Current"} price: ${price.error}`);

    // Currency and FX rates (EUR per 1 unit of the trade currency).
    // "GBX"/"GBp" = prices in pence: the FX columns are then EUR per 1 GBP and
    // prices are divided by 100.
    const rawCurrency = col.currency >= 0 ? String(cell("currency")).trim() : "";
    const isPence = rawCurrency === "GBp" || rawCurrency.toUpperCase() === "GBX";
    const currency = isPence ? "GBX" : (rawCurrency.toUpperCase() || BASE_CURRENCY);
    const fxCurrency = isPence ? "GBP" : currency;
    const unit = isPence ? 0.01 : 1;
    let fxEntry = { value: 1, error: null };
    let fxNow = { value: 1, error: null };
    if (!/^[A-Z]{3}$/.test(currency)) problems.push(`Currency: "${cell("currency")}" is not a 3-letter code`);
    else if (currency !== BASE_CURRENCY) {
      fxEntry = col.fxEntry >= 0 ? parseNumber(cell("fxEntry")) : fail("", "column missing");
      fxNow = col.fxNow >= 0 ? parseNumber(cell("fxNow")) : fail("", "column missing");
      if (fxEntry.error) problems.push(`FX Entry (EUR per ${fxCurrency}): ${fxEntry.error}`);
      if (fxNow.error) problems.push(`FX Exit/Current (EUR per ${fxCurrency}): ${fxNow.error}`);
    }

    const valid = problems.length === 0;

    // Local return (%), in the trade's own currency:
    //   long  (P − E) / E × 100,   short  (E − P) / E × 100
    const localReturnPct = valid ? direction * (price.value - entryPrice.value) / entryPrice.value * 100 : NaN;
    // Return in EUR (%), per unit, incl. the currency effect:
    //   long  (P × FXnow − E × FXentry) / (E × FXentry) × 100
    //   short (E × FXentry − P × FXnow) / (E × FXentry) × 100
    // (For pence prices the 1/100 factor cancels out; for EUR trades both FX are 1.)
    const entryEur = valid ? entryPrice.value * unit * fxEntry.value : NaN;
    const priceEur = valid ? price.value * unit * fxNow.value : NaN;
    const returnPct = valid ? direction * (priceEur - entryEur) / entryEur * 100 : NaN;

    // Days held: exit − entry for closed trades, as-of date − entry for open ones.
    let daysHeld = NaN;
    if (entryDate.value) {
      const end = isClosed ? exitDate.value : asOf;
      if (end) daysHeld = daysBetween(entryDate.value, end);
    }

    // Cross-check with the sheet's own numbers (warnings, not errors).
    const warnings = dataWarnings;
    const sheetReturn = parseNumber(cell("sheetReturnPct"));
    if (valid && !sheetReturn.error && Math.abs(sheetReturn.value - localReturnPct) > RETURN_TOLERANCE_PCT) {
      warnings.push(`return ${formatPercent(localReturnPct)} on the site vs ${formatPercent(sheetReturn.value)} in the sheet`);
    }
    const sheetDays = parseNumber(cell("sheetHoldingDays"));
    if (isClosed && Number.isFinite(daysHeld) && !sheetDays.error && sheetDays.value !== daysHeld) {
      warnings.push(`${daysHeld} days held on the site vs ${sheetDays.value} in the sheet`);
    }

    return {
      id: String(rowNumber - 1).padStart(3, "0"),
      ticker,
      name,
      label,
      side: side || "—",
      isClosed,
      status: isClosed ? "Closed" : "Open",
      entryDate: entryDate.value,
      exitDate: exitDate.value,
      entryPrice: entryPrice.value,
      exitPrice: exitPrice.value,
      currentPrice: currentPrice.value,
      price: price.value,           // exit price (closed) or current price (open)
      currency,
      localReturnPct,               // in the trade's currency
      returnPct,                    // in EUR, incl. currency effect
      daysHeld,
      valid,
      problems,
      warnings
    };
  }

  function calculateMetrics(trades, asOf) {
    const valid = trades.filter(t => t.valid);
    const open = trades.filter(t => !t.isClosed);
    const closed = trades.filter(t => t.isClosed);
    const validClosed = valid.filter(t => t.isClosed);
    const excluded = trades.filter(t => !t.valid);
    const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);

    // Win rate (%) = closed trades with return in EUR > 0 ÷ all valid closed trades × 100
    const closedWinners = validClosed.filter(t => t.returnPct > 0).length;
    const winRatePct = validClosed.length ? closedWinners / validClosed.length * 100 : NaN;

    // Average holding period (days) = mean of (exit − entry) over closed trades
    const avgHoldingDays = mean(closed.filter(t => Number.isFinite(t.daysHeld)).map(t => t.daysHeld));

    // First trade = earliest entry date (compared as dates, not text)
    const entryDates = trades.map(t => t.entryDate).filter(Boolean).sort((a, b) => a - b);
    const firstTradeDate = entryDates[0] || null;

    const byReturn = [...valid].sort((a, b) => b.returnPct - a.returnPct);

    return {
      asOf,
      firstTradeDate,
      winRatePct,
      closedWinners,
      avgHoldingDays,
      totalTrades: trades.length,
      openCount: open.length,
      closedCount: closed.length,
      validClosedCount: validClosed.length,
      excludedCount: excluded.length,
      bestTrade: byReturn[0] || null,
      worstTrade: byReturn[byReturn.length - 1] || null
    };
  }

  /** Pure function: CSV text → { trades, metrics, issues }. Used by the site and by tests. */
  function processCsv(text, asOf) {
    const issues = [];
    const rows = csvToRows(text || "");
    if (rows.length === 0) {
      issues.push({ level: "error", text: "The trade sheet is empty or could not be read." });
      return { trades: [], metrics: calculateMetrics([], asOf), issues };
    }

    const col = mapHeader(rows[0]);
    const missing = REQUIRED_COLUMNS.filter(f => col[f] === -1);
    if (missing.length) {
      issues.push({
        level: "error",
        text: `Columns missing in the sheet: ${missing.map(f => COLUMNS[f][0]).join(", ")}. No numbers are shown.`
      });
      return { trades: [], metrics: calculateMetrics([], asOf), issues };
    }

    const trades = rows.slice(1).map((cols, i) => buildTrade(cols, col, i + 2, asOf));

    trades.filter(t => !t.valid).forEach(t => {
      issues.push({ level: "error", text: `${t.label}: ${t.problems.join("; ")}. Excluded from the trade statistics.` });
    });
    if (col.currency === -1) {
      issues.push({ level: "warning", text: "The sheet has no Currency column, so all prices are treated as EUR." });
    }
    trades.filter(t => t.warnings.length).forEach(t => {
      issues.push({ level: "warning", text: `${t.label}: ${t.warnings.join("; ")}.` });
    });

    return { trades, metrics: calculateMetrics(trades, asOf), issues };
  }

  /* ─── PERFORMANCE ("Public" tab) ─────────────────────────────────────── */
  // The time-weighted return and the benchmark are calculated in the sheet
  // (it has the deposits and account values, which never reach the site).
  // The site only reads them, checks them and annualizes periods ≥ 1 year.

  function parsePercent(raw) {
    const s = String(raw === undefined || raw === null ? "" : raw).trim();
    const n = parseNumber(s);
    if (n.error) return n;
    // A plain fraction like 0,2735 would be off by a factor of 100.
    if (!s.includes("%")) return fail(raw, "not formatted as a percentage (% sign missing)");
    return n;
  }

  /**
   * Annualized return (%) = ((1 + r) ^ (365.25 / days) − 1) × 100,
   * only for periods of at least 365 days; shorter periods return NaN.
   */
  function annualize(cumulativePct, days) {
    if (!Number.isFinite(cumulativePct) || !Number.isFinite(days) || days < 365) return NaN;
    return (Math.pow(1 + cumulativePct / 100, 365.25 / days) - 1) * 100;
  }

  /** Pure function: Public-tab CSV text → { performance, issues }. */
  function processPublicCsv(text) {
    const issues = [];
    const values = {};
    csvToRows(text || "").forEach(row => {
      const label = String(row[0] || "").trim().toLowerCase();
      const key = Object.keys(PUBLIC_FIELDS).find(k => PUBLIC_FIELDS[k].label.toLowerCase() === label);
      if (key) values[key] = row[1];
    });

    const perf = {};
    Object.keys(PUBLIC_FIELDS).forEach(key => {
      const field = PUBLIC_FIELDS[key];
      const raw = values[key];
      if (raw === undefined) {
        perf[key] = field.type === "text" ? "" : field.type === "date" ? null : NaN;
        issues.push({ level: "error", text: `Performance tab: row "${field.label}" is missing.` });
        return;
      }
      let parsed;
      if (field.type === "date") {
        parsed = parseDate(raw);
        if (!parsed.error && !parsed.value) parsed = { value: null, error: "empty" };
      } else if (field.type === "percent") {
        parsed = parsePercent(raw);
      } else {
        parsed = { value: String(raw).trim(), error: null };
      }
      perf[key] = parsed.value;
      if (parsed.error) issues.push({ level: "error", text: `Performance tab: "${field.label}": ${parsed.error}. Shown as n/a.` });
    });

    // Length of the measured period (days) = as-of date − inception date
    perf.periodDays = perf.inceptionDate && perf.asOf ? daysBetween(perf.inceptionDate, perf.asOf) : NaN;
    perf.isAtLeastOneYear = perf.periodDays >= 365;
    perf.twrAnnualized = annualize(perf.twrSinceInception, perf.periodDays);
    perf.benchmarkAnnualized = annualize(perf.benchmarkSinceInception, perf.periodDays);
    // Difference vs benchmark (percentage points), same period
    perf.differenceSinceInception = perf.twrSinceInception - perf.benchmarkSinceInception;
    perf.differenceYtd = perf.twrYtd - perf.benchmarkYtd;

    return { performance: perf, issues };
  }

  /* ─── LOADING + CACHE ─────────────────────────────────────────────────── */
  // One snapshot { fetchedAt, tradesCsv, publicCsv } per browser session,
  // shared by all pages for CACHE_TTL_MS. Without this, every page fetched
  // on its own and Google's publish cache could serve different versions.

  function readCache() {
    try {
      const snap = JSON.parse(root.sessionStorage.getItem(CACHE_KEY));
      if (snap && Date.now() - snap.fetchedAt < CACHE_TTL_MS) return snap;
    } catch (e) { /* storage blocked or empty */ }
    return null;
  }

  function writeCache(snap) {
    try { root.sessionStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch (e) { /* ignore */ }
  }

  async function fetchCsv(url, what) {
    if (!url) throw new Error(`The ${what} CSV link is missing in data-config.js.`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheets answered HTTP ${response.status} for the ${what}.`);
    const text = await response.text();
    if (/^\s*</.test(text)) throw new Error(`Google Sheets returned a web page instead of CSV for the ${what}. Is the tab still published?`);
    return text;
  }

  async function fetchSnapshot() {
    const cached = readCache();
    if (cached) return cached;
    const [trades, perf] = await Promise.allSettled([
      fetchCsv(tradesCsvUrl, "trade log"),
      fetchCsv(publicCsvUrl, "performance tab")
    ]);
    const snap = {
      fetchedAt: Date.now(),
      tradesCsv: trades.status === "fulfilled" ? trades.value : null,
      tradesError: trades.status === "rejected" ? trades.reason.message : null,
      publicCsv: perf.status === "fulfilled" ? perf.value : null,
      publicError: perf.status === "rejected" ? perf.reason.message : null
    };
    if (snap.tradesCsv === null && snap.publicCsv === null) {
      throw new Error(`${snap.tradesError} ${snap.publicError}`);
    }
    // Only cache complete snapshots, so a temporary error is retried on the next page.
    if (!snap.tradesError && !snap.publicError) writeCache(snap);
    return snap;
  }

  function todayUtc(ms) {
    const d = new Date(ms);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  let loadPromise = null;

  function loadTradeData() {
    if (!loadPromise) {
      loadPromise = fetchSnapshot().then(snap => {
        const asOf = todayUtc(snap.fetchedAt);
        const result = snap.tradesCsv !== null
          ? processCsv(snap.tradesCsv, asOf)
          : { trades: [], metrics: calculateMetrics([], asOf), issues: [{ level: "error", text: `Trade log could not be loaded: ${snap.tradesError}` }] };
        if (snap.publicCsv !== null) {
          const perf = processPublicCsv(snap.publicCsv);
          result.performance = perf.performance;
          result.issues = perf.issues.concat(result.issues);
        } else {
          result.performance = processPublicCsv("").performance;
          result.issues.unshift({ level: "error", text: `Performance figures could not be loaded: ${snap.publicError}` });
        }
        result.fetchedAt = new Date(snap.fetchedAt);
        return result;
      });
    }
    return loadPromise;
  }

  /* ─── FORMATTING (1,234.56 · 24 Nov 2026) ─────────────────────────────── */

  const NA = "n/a";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatNumber(value, decimals = 2) {
    if (!Number.isFinite(value)) return NA;
    return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatPercent(value, decimals = 2) {
    if (!Number.isFinite(value)) return NA;
    const rounded = Number(value.toFixed(decimals));
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${formatNumber(value, decimals)}%`;
  }

  function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return "—";
    // Sheet dates are stored at UTC midnight.
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }

  function formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) return "—";
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm}`;
  }

  function signClass(value) {
    if (!Number.isFinite(value) || value === 0) return "";
    return value > 0 ? "positive" : "negative";
  }

  /* ─── PAGE HELPERS ────────────────────────────────────────────────────── */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /** Sets text and green/red class on an element by id. */
  function setValue(id, text, signedValue) {
    const el = root.document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove("positive", "negative");
    const cls = signClass(signedValue);
    if (cls) el.classList.add(cls);
  }

  /** Fills every [data-as-of] element and every [data-data-status] box. */
  function renderStatus(result, error) {
    const doc = root.document;
    doc.querySelectorAll("[data-as-of]").forEach(el => {
      el.textContent = result ? formatDateTime(result.fetchedAt) : "not available";
    });
    doc.querySelectorAll("[data-performance-as-of]").forEach(el => {
      el.textContent = result && result.performance && result.performance.asOf ? formatDate(result.performance.asOf) : NA;
    });
    doc.querySelectorAll("[data-inception-date]").forEach(el => {
      el.textContent = result && result.performance && result.performance.inceptionDate ? formatDate(result.performance.inceptionDate) : NA;
    });
    doc.querySelectorAll("[data-data-status]").forEach(box => {
      const items = error
        ? [{ level: "error", text: `Trade data could not be loaded: ${error.message} No numbers are shown.` }]
        : result.issues;
      box.innerHTML = items.map(i => `<p class="data-status__item data-status__item--${i.level}">${escapeHtml(i.text)}</p>`).join("");
      box.hidden = items.length === 0;
    });
    if (error) {
      // Replace loading placeholders so no stale or fake number stays visible.
      doc.querySelectorAll("[data-metric]").forEach(el => { el.textContent = NA; });
    }
  }

  async function initTradeData(callback) {
    try {
      const result = await loadTradeData();
      renderStatus(result, null);
      if (typeof callback === "function") callback(result);
    } catch (error) {
      console.error("[trade-data]", error);
      renderStatus(null, error);
    }
  }

  const api = {
    // data
    loadTradeData,
    initTradeData,
    processCsv,
    processPublicCsv,
    annualize,
    // parsing (exported for tests)
    parseNumber,
    parseDate,
    csvToRows,
    // formatting
    formatNumber,
    formatPercent,
    formatDate,
    formatDateTime,
    signClass,
    escapeHtml,
    setValue,
    NA
  };

  root.tradeData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
