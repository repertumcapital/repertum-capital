window.SITE_DATA_CONFIG = {
  googleSheet: {
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQcq-veQbpfXen7b2KO7__J0qRPd7R8tG9LLKgndMFHvG21ttEFteUphJvpnB6b2gJ2q_UfW0HbEVob/pub?gid=0&single=true&output=csv"
  },

  portfolio: {
    startCapital: 2000,
    benchmarkLabel: "MSCI World",
    benchmarkTicker: "EUNL.DE",   // iShares Core MSCI World UCITS ETF (EUR, XETRA)
    benchmarkReturnPct: 0,         // Fallback – wird live via Yahoo Finance überschrieben
    riskFreeRatePct: 2.5
  }
};