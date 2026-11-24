window.SITE_DATA_CONFIG = {
  googleSheet: {
    // Published CSV of the trade sheet ("File → Share → Publish to web → CSV").
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQcq-veQbpfXen7b2KO7__J0qRPd7R8tG9LLKgndMFHvG21ttEFteUphJvpnB6b2gJ2q_UfW0HbEVob/pub?gid=0&single=true&output=csv",
    // How long one downloaded version is reused across all pages of a visit.
    cacheMinutes: 10
  },

  portfolio: {
    // Used only to calculate total return (P&L ÷ start capital). Never displayed.
    startCapital: 2000,
    benchmarkLabel: "MSCI World",
    benchmarkTicker: "EUNL.DE"    // iShares Core MSCI World UCITS ETF (EUR, XETRA)
  }
};
