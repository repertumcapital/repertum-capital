// Run with: node --test tests/trade-data.test.js
// Uses made-up trades only (no real position sizes in the repo).
const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.SITE_DATA_CONFIG = { googleSheet: { csvUrl: "unused" }, portfolio: { startCapital: 1000 } };
const td = require("../trade-data.js");

const HEADER = 'Datum Einstieg,Datum Ausstieg,Ticker,Name,Current Price,Side (Long/Short),Stück,Entry Price,Exit Price,P&L €,P&L %,Holding Period (Tage)';
const AS_OF = new Date(Date.UTC(2026, 10, 24));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

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

test("metrics follow the documented formulas", () => {
  const csv = [
    HEADER,
    '10.03.2025,,AAA,Alpha,"120,00",Long,"2,00","100,00",,,"20,00%",',          // open long  +20 %, pnl +40
    '01.01.2025,31.01.2025,BBB,Beta,-,Short,"10,00","10,00","8,00",,"20,00%",30', // closed short +20 %, pnl +20
    '15.02.2025,15.04.2025,CCC,Gamma,-,Long,"5,00","50,00","40,00",,"-20,00%",59' // closed long -20 %, pnl -50
  ].join("\n");
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);

  near(trades[0].returnPct, 20);
  near(trades[1].returnPct, 20);
  near(trades[2].returnPct, -20);
  near(metrics.totalReturnPct, (40 + 20 - 50) / 1000 * 100);   // 1 %
  near(metrics.openReturnPct, 40 / 200 * 100);                  // 20 %
  near(metrics.winRatePct, 50);                                 // 1 of 2 closed
  near(metrics.avgHoldingDays, (30 + 59) / 2);
  assert.equal(metrics.startDate.toISOString(), "2025-01-01T00:00:00.000Z"); // date order, not text order
  assert.equal(issues.filter(i => !i.text.includes("Currency column")).length, 0, JSON.stringify(issues));
});

test("error cells are excluded visibly, not counted as 0", () => {
  const csv = [
    HEADER,
    '10.03.2025,,AAA,Alpha,#N/A,Long,"2,00","100,00",,#N/A,#N/A,',
    '10.03.2025,,BBB,Beta,"110,00",Long,"1,00","100,00",,,"10,00%",'
  ].join("\n");
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(trades[0].valid, false);
  assert.ok(Number.isNaN(trades[0].returnPct));
  near(metrics.totalReturnPct, 10 / 1000 * 100);
  assert.equal(metrics.excludedCount, 1);
  assert.ok(issues.some(i => i.level === "error" && i.text.includes("AAA") && i.text.includes("#N/A")));
});

test("mismatch with the sheet's own P&L % is reported", () => {
  const csv = [HEADER, '10.03.2025,,AAA,Alpha,"120,00",Long,"1,00","100,00",,,"25,00%",'].join("\n");
  const { issues } = td.processCsv(csv, AS_OF);
  assert.ok(issues.some(i => i.level === "warning" && i.text.includes("AAA")));
});

test("missing columns stop the calculation", () => {
  const { trades, issues } = td.processCsv("Ticker,Name\nAAA,Alpha", AS_OF);
  assert.equal(trades.length, 0);
  assert.equal(issues[0].level, "error");
});

const FX_HEADER = HEADER + ',Currency,FX Entry,FX Exit/Current';

test("USD trades are converted with the entry-date and current/exit FX rates", () => {
  const csv = [
    FX_HEADER,
    // long USD: 100 → 110 (+10 % local); FX 0,90 → 0,80 EUR per USD
    '01.02.2025,,EMX,EM ETF,"110,00",Long,"10,00","100,00",,,"10,00%",,USD,"0,90","0,80"',
    // short USD, closed: 50 → 40 (+20 % local); FX 0,90 → 1,00
    '01.03.2025,01.04.2025,SHRT,Short Co,-,Short,"10,00","50,00","40,00",,"20,00%",31,USD,"0,90","1,00"',
    // EUR trade without FX values
    '01.01.2025,,EUR1,Euro Co,"105,00",Long,"10,00","100,00",,,"5,00%",,EUR,,'
  ].join("\n");
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(issues.length, 0, JSON.stringify(issues));

  // long: cost 100×0.9×10 = 900; value 110×0.8×10 = 880 → pnl −20, −2.22 % in EUR
  near(trades[0].localReturnPct, 10);
  near(trades[0].pnl, -20, 1e-9);
  near(trades[0].returnPct, -20 / 900 * 100);
  // short: cost 50×0.9×10 = 450; pnl = (450 − 40×1.0×10) = +50 → +11.11 % in EUR
  near(trades[1].localReturnPct, 20);
  near(trades[1].pnl, 50, 1e-9);
  near(trades[1].returnPct, 50 / 450 * 100);
  // EUR trade unchanged
  near(trades[2].returnPct, 5);

  near(metrics.totalReturnPct, (-20 + 50 + 50) / 1000 * 100);
  near(metrics.winRatePct, 100); // the closed short gained in EUR
  assert.equal(trades[0].currency, "USD");
});

test("missing FX rate for a non-EUR trade is an error, missing currency column a warning", () => {
  const csv = [FX_HEADER, '01.02.2025,,EMX,EM ETF,"110,00",Long,"10,00","100,00",,,"10,00%",,USD,#N/A,"0,80"'].join("\n");
  const r = td.processCsv(csv, AS_OF);
  assert.equal(r.trades[0].valid, false);
  assert.ok(r.issues.some(i => i.level === "error" && i.text.includes("FX Entry")));

  const r2 = td.processCsv([HEADER, '10.03.2025,,AAA,Alpha,"120,00",Long,"1,00","100,00",,,"20,00%",'].join("\n"), AS_OF);
  assert.ok(r2.issues.some(i => i.level === "warning" && i.text.includes("Currency column")));
});

test("pence prices (GBX) use EUR per GBP and are divided by 100", () => {
  const csv = [FX_HEADER, '01.02.2025,,MTE,UK Co,"600,00",Long,"10,00","500,00",,,"20,00%",,GBX,"1,20","1,10"'].join("\n");
  const { trades, issues } = td.processCsv(csv, AS_OF);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  // cost 5.00 GBP × 1.20 × 10 = 60 EUR; value 6.00 × 1.10 × 10 = 66 EUR → +6 EUR, +10 %
  near(trades[0].pnl, 6, 1e-9);
  near(trades[0].returnPct, 10);
  assert.equal(trades[0].currency, "GBX");
});

test("missing entry date keeps the trade in the totals with a warning; names lose line breaks", () => {
  const csv = HEADER + ',Currency\n,,AAA,"Alpha\nFund","110,00",Long,"1,00","100,00",,,"10,00%",,EUR';
  const { trades, metrics, issues } = td.processCsv(csv, AS_OF);
  assert.equal(trades[0].valid, true);
  assert.equal(trades[0].name, "Alpha Fund");
  near(metrics.totalReturnPct, 1);
  assert.equal(metrics.startDate, null);
  assert.ok(issues.some(i => i.level === "warning" && i.text.includes("entry date missing")));
});

test("formatting uses 1,234.56 and 24 Nov 2026", () => {
  assert.equal(td.formatNumber(1234.567, 2), "1,234.57");
  assert.equal(td.formatPercent(25.1), "+25.10%");
  assert.equal(td.formatPercent(-3), "-3.00%");
  assert.equal(td.formatPercent(NaN), "n/a");
  assert.equal(td.formatDate(new Date(Date.UTC(2026, 10, 24))), "24 Nov 2026");
});
