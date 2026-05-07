(function () {
  "use strict";

  const config = window.SITE_DATA_CONFIG || {};
  const csvUrl = config.googleSheet?.csvUrl;
  const portfolioConfig = config.portfolio || {};

  const state = {
    trades: [],
    metrics: null,
    loaded: false
  };

  function parseGermanNumber(value) {
    if (value === null || value === undefined) return NaN;

    const cleaned = String(value)
      .trim()
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(,|$))/g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "");

    if (!cleaned) return NaN;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : NaN;
  }

  function formatNumber(value, decimals = 0) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return safeValue.toLocaleString("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatCurrency(value, decimals = 0) {
    return `€ ${formatNumber(value, decimals)}`;
  }

  function formatPercent(value, decimals = 2) {
    const safeValue = Number.isFinite(value) ? value : 0;
    const sign = safeValue > 0 ? "+" : "";
    return `${sign}${formatNumber(safeValue, decimals)} %`;
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
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(current);
        current = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i++;
        row.push(current);
        rows.push(row);
        row = [];
        current = "";
      } else {
        current += char;
      }
    }

    if (current.length > 0 || row.length > 0) {
      row.push(current);
      rows.push(row);
    }

    return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
  }

  function normalizeTrade(cols, index) {
    const entryDate = cols[0] || "";
    const exitDate = cols[1] || "";
    const ticker = cols[2] || "";
    const name = cols[3] || "";
    const currentPrice = parseGermanNumber(cols[4]);
    const side = cols[5] || "Long";
    const shares = parseGermanNumber(cols[6]);
    const entryPrice = parseGermanNumber(cols[7]);
    const exitPrice = parseGermanNumber(cols[8]);
    const pnlEuro = parseGermanNumber(cols[9]);
    const pnlPct = parseGermanNumber(cols[10]);
    const holdingDays = parseGermanNumber(cols[11]);

    const isClosed = !!String(exitDate).trim();
    const effectivePrice = isClosed
      ? (Number.isFinite(exitPrice) ? exitPrice : currentPrice)
      : currentPrice;

    const investedCapital =
      Number.isFinite(entryPrice) && Number.isFinite(shares)
        ? entryPrice * shares
        : 0;

    const marketValue =
      Number.isFinite(effectivePrice) && Number.isFinite(shares)
        ? effectivePrice * shares
        : 0;

    return {
      id: String(index + 1).padStart(3, "0"),
      entryDate,
      exitDate,
      ticker,
      name,
      currentPrice,
      side,
      shares,
      entryPrice,
      exitPrice,
      pnlEuro,
      pnlPct,
      holdingDays,
      isClosed,
      status: isClosed ? "Closed" : "Open",
      effectivePrice,
      investedCapital,
      marketValue
    };
  }

  // ── Live MSCI World Benchmark via Yahoo Finance ──────────────────────────
  // Verwendet EUNL.DE (iShares Core MSCI World UCITS ETF, EUR, XETRA).
  // Probiert mehrere CORS-Proxies der Reihe nach.

  function parseDateTs(str) {
    if (!str || str === "—") return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return Date.parse(str);
    const parts = str.split(".");
    if (parts.length === 3) {
      return Date.parse(`${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`);
    }
    return Date.parse(str);
  }

  async function fetchYahooViaProxy(yahooUrl, proxy) {
    if (proxy === "allorigins") {
      const url = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`allorigins HTTP ${res.status}`);
      const wrapper = await res.json();
      return JSON.parse(wrapper.contents);
    }
    if (proxy === "corsproxy") {
      const url = `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`corsproxy HTTP ${res.status}`);
      return await res.json();
    }
    throw new Error("Unbekannter Proxy");
  }

  function extractReturnFromYahooJson(json, startDateStr) {
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes || timestamps.length === 0) return null;

    const startTs = parseDateTs(startDateStr);
    let startPrice = null;

    if (startTs) {
      const startTsSec = startTs / 1000;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= startTsSec && closes[i] != null) {
          startPrice = closes[i];
          break;
        }
      }
    }
    if (!startPrice) {
      for (let i = 0; i < closes.length; i++) {
        if (closes[i] != null) { startPrice = closes[i]; break; }
      }
    }

    let currentPrice = null;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) { currentPrice = closes[i]; break; }
    }

    if (!startPrice || !currentPrice) return null;
    return ((currentPrice - startPrice) / startPrice) * 100;
  }

  async function fetchLiveBenchmarkReturn(startDateStr) {
    const ticker = portfolioConfig.benchmarkTicker || "EUNL.DE";
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3y`;
    const proxies = ["allorigins", "corsproxy"];

    for (const proxy of proxies) {
      try {
        console.log(`[Benchmark] Versuche Proxy: ${proxy}`);
        const json = await fetchYahooViaProxy(yahooUrl, proxy);
        const returnPct = extractReturnFromYahooJson(json, startDateStr);
        if (returnPct !== null) {
          console.log(`[Benchmark] Erfolgreich via ${proxy}: ${returnPct.toFixed(2)}% (seit ${startDateStr})`);
          return returnPct;
        }
        console.warn(`[Benchmark] ${proxy} – Daten ok aber kein Return berechnet`);
      } catch (e) {
        console.warn(`[Benchmark] ${proxy} fehlgeschlagen:`, e.message);
      }
    }

    console.error("[Benchmark] Alle Proxies fehlgeschlagen – Benchmark bleibt 0%");
    return null;
  }
  // ─────────────────────────────────────────────────────────────────────────

  function calculateMetrics(trades) {
    const startCapital = portfolioConfig.startCapital || 2000;
    const benchmarkReturnPct = portfolioConfig.benchmarkReturnPct || 0;

    const openTrades = trades.filter(t => !t.isClosed);
    const closedTrades = trades.filter(t => t.isClosed);

    const totalInvested = openTrades.reduce((sum, t) => sum + t.investedCapital, 0);
    const totalMarketValue = openTrades.reduce((sum, t) => sum + t.marketValue, 0);
    const totalUnrealizedPnl = openTrades.reduce((sum, t) => sum + (Number.isFinite(t.pnlEuro) ? t.pnlEuro : 0), 0);
    const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + (Number.isFinite(t.pnlEuro) ? t.pnlEuro : 0), 0);
    const totalPnl = trades.reduce((sum, t) => sum + (Number.isFinite(t.pnlEuro) ? t.pnlEuro : 0), 0);

    const cashReserve = startCapital - totalInvested;
    const portfolioValue = startCapital + totalPnl;
    const totalReturnPct = startCapital ? (totalPnl / startCapital) * 100 : 0;
    const alphaPct = totalReturnPct - benchmarkReturnPct;

    const winningTrades = trades.filter(t => Number.isFinite(t.pnlEuro) && t.pnlEuro > 0);
    const losingTrades = trades.filter(t => Number.isFinite(t.pnlEuro) && t.pnlEuro < 0);
    const hitRatio = trades.length ? (winningTrades.length / trades.length) * 100 : 0;

    const avgHoldingDays =
      trades.length > 0
        ? trades.reduce((sum, t) => sum + (Number.isFinite(t.holdingDays) ? t.holdingDays : 0), 0) / trades.length
        : 0;

    const bestTrade = [...trades]
      .filter(t => Number.isFinite(t.pnlPct))
      .sort((a, b) => b.pnlPct - a.pnlPct)[0] || null;

    const worstTrade = [...trades]
      .filter(t => Number.isFinite(t.pnlPct))
      .sort((a, b) => a.pnlPct - b.pnlPct)[0] || null;

    const totalWeightBase = totalMarketValue || 1;
    const openTradesWithWeight = openTrades
      .map(trade => ({
        ...trade,
        weightPct: (trade.marketValue / totalWeightBase) * 100
      }))
      .sort((a, b) => b.weightPct - a.weightPct);

    const startDate =
      trades
        .map(t => t.entryDate)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))[0] || "—";

    return {
      startCapital,
      benchmarkReturnPct,
      totalInvested,
      totalMarketValue,
      totalUnrealizedPnl,
      totalRealizedPnl,
      totalPnl,
      cashReserve,
      portfolioValue,
      totalReturnPct,
      alphaPct,
      hitRatio,
      avgHoldingDays,
      startDate,
      totalTrades: trades.length,
      openCount: openTrades.length,
      closedCount: closedTrades.length,
      winners: winningTrades.length,
      losers: losingTrades.length,
      bestTrade,
      worstTrade,
      openTradesWithWeight
    };
  }

  async function loadTradeData() {
    if (state.loaded) return state;
    if (!csvUrl) throw new Error("Google Sheets CSV URL fehlt in data-config.js");

    const response = await fetch(csvUrl);
    const text = await response.text();
    const rows = csvToRows(text);

    if (rows.length <= 1) {
      state.trades = [];
      state.metrics = calculateMetrics([]);
      state.loaded = true;
    } else {
      const dataRows = rows.slice(1);
      const trades = dataRows.map(normalizeTrade);
      state.trades = trades;
      state.metrics = calculateMetrics(trades);
      state.loaded = true;
    }

    // Live-Benchmark nachladen und Metrics aktualisieren
    try {
      const liveBenchmark = await fetchLiveBenchmarkReturn(state.metrics.startDate);
      if (liveBenchmark !== null) {
        state.metrics.benchmarkReturnPct = liveBenchmark;
        state.metrics.alphaPct = state.metrics.totalReturnPct - liveBenchmark;
        state.metrics.benchmarkLive = true;
      }
    } catch (e) {
      // Fallback auf Konfigurationswert – kein Fehler nach außen
    }

    return state;
  }

  async function initTradeData(callback) {
    try {
      const result = await loadTradeData();
      if (typeof callback === "function") callback(result);
    } catch (error) {
      console.error("Fehler beim Laden der Trade-Daten:", error);
    }
  }

  window.tradeData = {
    state,
    loadTradeData,
    initTradeData,
    formatNumber,
    formatCurrency,
    formatPercent
  };
})();