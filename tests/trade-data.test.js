// Run with: node --test tests/trade-data.test.js
// Uses made-up trades only (no real data in the repo).
const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.SITE_DATA_CONFIG = { googleSheet: { tradesCsvUrl: "unused", publicCsvUrl: "unused" } };
const td = require("../trade-data.js");

const HEADER = 'Datum Einstieg,Datum Ausstieg,Ticker,Name,Current Price,Side (Long/Short),Entry Price,Exit Price,P&L %,Holding Period (Tage),Currency,FX Entry,FX Exit/Current';
const AS_OF = new Date(Date.UTC(2026, 10, 24));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const errors = issues => issues.filter(i => i.level === "error");

test("parseNumber reads German formats", () => {
  near(td.parseNumber("952,89").value, 952.89);
  near(td.parseNumber("1.102,15").value, 1102.15);
  near(td.parseNumber("1.234.567,5").value, 1234567.5);
  near(td.parseNumber("-12,5").value, -12.5);
  near(td.parseNumber("25,10%").value, 25.1);
  near(td.parseNumber("100").value, 100);
  near(td.parseNumber("1.234").value, 1234);
});

test("parseNumber rejects errors and ambiguous values instead of returning 0", () => {
  for (const raw of ["", "-", "#N/A", "#REF!", "#VALUE!", "Loading...", "1,102.15", "12,3,4", "abc"]) {
    const r = td.parseNumber(raw);
    assert.ok(Number.isNaN(r.value), raw);
    assert.ok(r.error, raw);
  }
});

test("parseDate reads dd.mm.yyyy and rejects impossible dates", () => {
  assert.equal(td.parseDate("24.11.2026").value.toISOString(), "2026-11-24T00:00:00.000Z");
  assert.equal(td.parseDate("4.1.2026").value.toISOString(), "2026-01-04T00:00:00.000Z");
  assert.equal(td.parseDate("").value, null);
  assert.ok(td.parseDate("31.02.2026").error);
  assert.ok(td.parseDate("2026/11/24").error);
});

test("trade returns for long and short, win rate, holding period", () => {
  const csv = [
    HEADER,
    '10.03.2025,,AAA,Alpha,"120,00",Long,"100,00",,"20,00%",,EUR,,',            // open long +20 %
    '01.01.2025,31.01.2025,BBB,Beta,-,Short,"10,00","8,00","20,00%",30,EUR,,',   // closed short +20 %
    '15.02.2025,15.04.2025,CCC,Gamma,-,Long,"50,00","40,00","-20,00%",59,EUR,,'  // closed long −20 %
  ].join("\n");
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  near(trades[0].returnPct, 20);
  near(trades[1].returnPct, 20);
  near(trades[2].returnPct, -20);
  near(metrics.winRatePct, 50);                       // 1 of 2 closed
  near(metrics.avgHoldingDays, (30 + 59) / 2);
  assert.equal(metrics.firstTradeDate.toISOString(), "2025-01-01T00:00:00.000Z"); // date order, not text order
});

test("USD trades are converted with the entry-date and current/exit FX rates", () => {
  const csv = [
    HEADER,
    // long USD: 100 → 110 (+10 % local); FX 0,90 → 0,80 EUR per USD → 88/90 − 1 = −2.22 %
    '01.02.2025,,EMX,EM ETF,"110,00",Long,"100,00",,"10,00%",,USD,"0,90","0,80"',
    // short USD, closed: 50 → 40 (+20 % local); FX 0,90 → 1,00 → (45 − 40)/45 = +11.11 %
    '01.03.2025,01.04.2025,SHRT,Short Co,-,Short,"50,00","40,00","20,00%",31,USD,"0,90","1,00"'
  ].join("\n");
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  near(trades[0].localReturnPct, 10);
  near(trades[0].returnPct, (88 - 90) / 90 * 100);
  near(trades[1].localReturnPct, 20);
  near(trades[1].returnPct, (45 - 40) / 45 * 100);
  near(metrics.winRatePct, 100);
});

test("pence prices (GBX) use EUR per GBP", () => {
  const csv = [HEADER, '01.02.2025,,MTE,UK Co,"600,00",Long,"500,00",,"20,00%",,GBX,"1,20","1,10"'].join("\n");
  const { trades, issues } = td.processCsv(csv, AS_OF);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  near(trades[0].returnPct, (6 * 1.1 - 5 * 1.2) / (5 * 1.2) * 100); // +10 %
  assert.equal(trades[0].currency, "GBX");
});

test("error cells and missing FX rates exclude the trade visibly", () => {
  const csv = [
    HEADER,
    '10.03.2025,,AAA,Alpha,#N/A,Long,"100,00",,#N/A,,EUR,,',
    '01.02.2025,,EMX,EM ETF,"110,00",Long,"100,00",,"10,00%",,USD,#N/A,"0,80"'
  ].join("\n");
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(trades[0].valid, false);
  assert.equal(trades[1].valid, false);
  assert.ok(Number.isNaN(trades[0].returnPct));
  assert.equal(metrics.excludedCount, 2);
  assert.ok(errors(issues).some(i => i.text.includes("AAA") && i.text.includes("#N/A")));
  assert.ok(errors(issues).some(i => i.text.includes("EMX") && i.text.includes("FX Entry")));
});

test("missing entry date: trade kept with a warning; names lose line breaks", () => {
  const csv = HEADER + '\n,,AAA,"Alpha\nFund","110,00",Long,"100,00",,"10,00%",,EUR,,';
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(trades[0].valid, true);
  assert.equal(trades[0].name, "Alpha Fund");
  assert.equal(metrics.firstTradeDate, null);
  assert.ok(issues.some(i => i.level === "warning" && i.text.includes("entry date missing")));
});

test("mismatch with the sheet's own P&L % is reported; missing currency column is a warning", () => {
  const h = 'Datum Einstieg,Datum Ausstieg,Ticker,Name,Current Price,Side (Long/Short),Entry Price,Exit Price,P&L %';
  const { issues } = td.processCsv([h, '10.03.2025,,AAA,Alpha,"120,00",Long,"100,00",,"25,00%"'].join("\n"), AS_OF);
  assert.ok(issues.some(i => i.level === "warning" && i.text.includes("AAA")));
  assert.ok(issues.some(i => i.level === "warning" && i.text.includes("Currency column")));
});

test("missing columns stop the calculation", () => {
  const { trades, issues } = td.processCsv("Ticker,Name\nAAA,Alpha", AS_OF);
  assert.equal(trades.length, 0);
  assert.equal(issues[0].level, "error");
});

const PUBLIC = [
  "Metric,Value",
  "Note,Percentages only. Calculated in the Performance tab.",
  "Inception date,21.01.2025",
  "As of,31.10.2026",
  'Time-weighted return since inception,"21,00%"',
  'Time-weighted return year-to-date,"8,50%"',
  "Benchmark,MSCI World (EUNL)",
  'Benchmark return since inception,"18,00%"',
  'Benchmark return year-to-date,"9,25%"'
].join("\n");

test("Public tab: values, difference and annualization over >= 1 year", () => {
  const { performance: p, issues } = td.processPublicCsv(PUBLIC);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  near(p.twrSinceInception, 21);
  near(p.benchmarkYtd, 9.25);
  assert.equal(p.benchmarkName, "MSCI World (EUNL)");
  assert.equal(p.periodDays, 648);
  near(p.twrAnnualized, (Math.pow(1.21, 365.25 / 648) - 1) * 100);
  near(p.differenceSinceInception, 3);
  near(p.differenceYtd, -0.75);
});

test("Public tab: periods under one year are not annualized", () => {
  const csv = PUBLIC.replace("21.01.2025", "01.03.2026");
  const { performance: p } = td.processPublicCsv(csv);
  assert.equal(p.isAtLeastOneYear, false);
  assert.ok(Number.isNaN(p.twrAnnualized));
  assert.ok(Number.isNaN(td.annualize(10, 364)));
});

test("Public tab: plain fractions, error cells and missing rows are errors", () => {
  const csv = PUBLIC
    .replace('"21,00%"', '"0,21"')
    .replace('"9,25%"', "#N/A")
    .replace(/Time-weighted return year-to-date.*\n/, "");
  const { performance: p, issues } = td.processPublicCsv(csv);
  assert.ok(Number.isNaN(p.twrSinceInception));
  assert.ok(Number.isNaN(p.benchmarkYtd));
  assert.ok(Number.isNaN(p.twrYtd));
  assert.ok(issues.some(i => i.text.includes("% sign missing")));
  assert.ok(issues.some(i => i.text.includes("#N/A")));
  assert.ok(issues.some(i => i.text.includes("year-to-date") && i.text.includes("missing")));
});

test("formatting uses 1,234.56 and 24 Nov 2026", () => {
  assert.equal(td.formatNumber(1234.567, 2), "1,234.57");
  assert.equal(td.formatPercent(25.1), "+25.10%");
  assert.equal(td.formatPercent(-3), "-3.00%");
  assert.equal(td.formatPercent(NaN), "n/a");
  assert.equal(td.formatDate(new Date(Date.UTC(2026, 10, 24))), "24 Nov 2026");
});
