window.SITE_DATA_CONFIG = {
  // Published CSV links ("File → Share → Publish to web → <tab> → CSV").
  // This repository is public: never put money amounts or position sizes here.
  googleSheet: {
    // Trade log tab (one row per trade).
    tradesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQcq-veQbpfXen7b2KO7__J0qRPd7R8tG9LLKgndMFHvG21ttEFteUphJvpnB6b2gJ2q_UfW0HbEVob/pub?gid=0&single=true&output=csv",
    // "Public" tab with the time-weighted return and benchmark (percentages only).
    // TODO: paste the published CSV link of the Public tab here.
    publicCsvUrl: "",
    // How long one downloaded version is reused across all pages of a visit.
    cacheMinutes: 10
  }
};
