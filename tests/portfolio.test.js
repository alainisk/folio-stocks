import test from "node:test";
import assert from "node:assert/strict";
import {
  summary,
  realizedTrades,
  validateTransaction,
  validateQuote,
  validateBackup,
  quoteKey,
  csv,
  pct,
  marketDate,
} from "../src/lib/portfolio.js";
import { initialState } from "../src/lib/seed.js";
const base = () => ({
  version: 1,
  demo: false,
  transactions: [],
  quotes: {},
  watchlist: [],
  snapshots: [],
  budgets: { USD: 100000, CAD: 100000, EUR: 100000 },
});
const buy = (x = {}) => ({
  id: "b1",
  type: "buy",
  portfolio: "actual",
  currency: "USD",
  symbol: "TEST",
  exchange: "NASDAQ",
  name: "Test Co",
  date: "2026-01-05",
  shares: 10,
  price: 100,
  fee: 5,
  ...x,
});
const quote = {
  current: 120,
  previous: 110,
  source: "Manual",
  asOf: "2026-01-06T20:00:00Z",
};
const setup = (ts, q = quote) => ({
  ...base(),
  transactions: ts,
  quotes: { [quoteKey("actual", "USD", "TEST")]: q },
});
const calc = (s) => summary(s, "actual", "USD");
test("purchase cost includes fees; daily and lifetime returns have different baselines", () => {
  const s = calc(setup([buy()]));
  assert.equal(s.invested, 1005);
  assert.equal(s.value, 1200);
  assert.equal(s.total, 195);
  assert.equal(s.daily, 100);
  assert.equal(s.dailyPct, (100 / 1100) * 100);
  assert.equal(s.totalPct, (195 / 1005) * 100);
});
test("same-session buys start at purchase price and charge fees only once", () => {
  const s = calc(setup([buy({ date: "2026-01-06" })]));
  assert.equal(s.daily, 195);
  assert.equal(s.dailyPct, (195 / 1005) * 100);
});
test("partial sale allocates cost and fees to selected lot, includes daily realized movement", () => {
  const sell = {
    ...buy(),
    id: "s1",
    type: "sell",
    lotId: "b1",
    date: "2026-01-06",
    shares: 4,
    price: 115,
    fee: 2,
  };
  const s = calc(setup([buy(), sell]));
  assert.equal(s.invested, 603);
  assert.equal(s.value, 720);
  assert.equal(s.realized, 56);
  assert.equal(s.total, 173);
  assert.equal(s.daily, 78);
});
test("fully sold positions retain lifetime realized gains and daily sale gains", () => {
  const sell = {
    ...buy(),
    id: "s1",
    type: "sell",
    lotId: "b1",
    date: "2026-01-06",
    shares: 10,
    price: 115,
    fee: 2,
  };
  const s = calc(setup([buy(), sell]));
  assert.equal(s.open.length, 0);
  assert.equal(s.realized, 143);
  assert.equal(s.total, 143);
  assert.equal(s.daily, 48);
});
test("realized trades preserve each sale and its allocated lot costs in the trade currency", () => {
  const usd = buy({ platform: "Example Broker" });
  const cad = buy({ id: "cad-buy", currency: "CAD", exchange: "TSX" });
  const simulated = buy({ id: "demo-buy", portfolio: "simulated" });
  const sell = (purchase, changes) => ({
    ...purchase,
    type: "sell",
    lotId: purchase.id,
    date: "2026-01-06",
    price: 115,
    shares: 4,
    fee: 2,
    ...changes,
  });
  const transactions = [
    usd,
    cad,
    simulated,
    buy({ id: "open-buy" }),
    sell(usd, { id: "partial" }),
    sell(usd, { id: "remaining", date: "2026-01-07", shares: 6, price: 90 }),
    sell(cad, { id: "cad-sell", date: "2026-01-08", price: 101 }),
    sell(simulated, { id: "demo-sell" }),
  ];
  validateBackup({ ...base(), transactions });
  const [canadianSale, loss, profit] = realizedTrades(transactions, "actual");
  assert.deepEqual(
    realizedTrades(transactions, "actual").map((t) => t.id),
    ["cad-sell", "remaining", "partial"],
  );
  assert.equal(canadianSale.currency, "CAD");
  assert.equal(canadianSale.platform, undefined);
  assert.equal(canadianSale.total, 0);
  assert.equal(canadianSale.totalPct, 0);
  assert.equal(loss.total, -65);
  assert.equal(loss.totalPct, pct(-65, 603));
  assert.equal(profit.platform, "Example Broker");
  assert.equal(profit.purchaseDate, "2026-01-05");
  assert.equal(profit.date, "2026-01-06");
  assert.equal(profit.shares, 4);
  assert.equal(profit.avgPurchase, 100.5);
  assert.equal(profit.initialInvestment, 400);
  assert.equal(profit.total, 56);
  assert.equal(profit.totalPct, pct(56, 402));
  assert.equal(
    calc({ ...base(), transactions }).realized,
    loss.total + profit.total,
  );
});
test("same-day purchase and sale, dividends and fees reconcile", () => {
  const b = buy({ date: "2026-01-06" }),
    sell = {
      ...b,
      id: "s1",
      type: "sell",
      lotId: "b1",
      shares: 4,
      price: 115,
      fee: 2,
    },
    div = { ...b, id: "d1", type: "dividend", amount: 20 };
  const s = calc(setup([b, sell, div]));
  assert.equal(s.total, 193);
  assert.equal(s.daily, 193);
});
test("prior sales are excluded from next session exposure", () => {
  const sell = {
    ...buy(),
    id: "s1",
    type: "sell",
    lotId: "b1",
    shares: 4,
    price: 105,
    fee: 2,
  };
  const s = calc(setup([buy(), sell]));
  assert.equal(s.daily, 60);
});
test("separate portfolios and currencies never mix", () => {
  const s = setup([
    buy(),
    buy({ id: "b2", portfolio: "simulated" }),
    buy({ id: "b3", currency: "CAD" }),
  ]);
  assert.equal(calc(s).value, 1200);
  assert.equal(summary(s, "actual", "CAD").value, null);
  assert.equal(summary(s, "simulated", "USD").value, null);
});
test("missing or older-than-purchase quotes never invent P/L", () => {
  const s = setup([buy({ date: "2026-01-07" })]);
  assert.equal(calc(s).value, null);
  assert.equal(calc(s).total, null);
  assert.equal(calc(s).totalPct, null);
  assert.equal(calc(s).daily, null);
  assert.equal(pct(null, 100), null);
});
test("quotes from different sessions suppress aggregate daily P/L", () => {
  const s = setup([buy(), buy({ id: "b2", symbol: "OTHER" })]);
  s.quotes[quoteKey("actual", "USD", "OTHER")] = {
    ...quote,
    asOf: "2026-01-07T20:00:00Z",
  };
  assert.equal(calc(s).daily, null);
  assert.equal(calc(s).mixedDays, true);
});
test("oversells, negative prices, invalid dates and future timestamps rejected", () => {
  const s = setup([buy()]);
  assert.throws(
    () =>
      validateTransaction(
        { ...buy(), id: "s", type: "sell", lotId: "b1", shares: 11 },
        s,
      ),
    /exceeds/,
  );
  assert.throws(() => validateTransaction(buy({ price: -1 }), base()));
  assert.throws(() => validateTransaction(buy({ date: "2026-02-30" }), base()));
  assert.throws(() => validateQuote({ ...quote, asOf: "2099-01-01" }));
});
test("valid backups round-trip and corrupted backups are rejected", () => {
  assert.equal(validateBackup(initialState()).version, 1);
  assert.throws(
    () => validateBackup({ ...base(), transactions: [buy(), buy()] }),
    /Duplicate/,
  );
  assert.throws(() =>
    validateBackup({ ...base(), watchlist: [{ symbol: "broken" }] }),
  );
  assert.throws(() =>
    validateBackup({ ...base(), snapshots: [{ value: "bad" }] }),
  );
});
test("CSV escapes quotes and spreadsheet formulas", () => {
  const out = csv([["=SUM(A1)", 'hello,"world"', -12.5]]);
  assert.ok(out.includes("'=SUM(A1)"));
  assert.ok(out.includes('hello,""world""'));
  assert.ok(out.includes('"-12.5"'));
});
test("market date uses New York session rather than UTC calendar", () =>
  assert.equal(marketDate("2026-01-07T01:00:00Z"), "2026-01-06"));
test("initial investment excludes fees and preserves full purchase principal after sale", () => {
  const b = buy(),
    sale = {
      ...b,
      id: "s1",
      type: "sell",
      lotId: "b1",
      date: "2026-01-06",
      shares: 4,
      price: 115,
      fee: 2,
    };
  const s = calc(setup([b, sale]));
  assert.equal(s.initialInvestment, 1000);
  assert.equal(s.invested, 603);
  assert.equal(s.outlay, 1005);
});
test("same symbol on different markets remains separate with separate quotes", () => {
  const s = setup([
    buy(),
    buy({ id: "b2", exchange: "NYSE", shares: 5, price: 200 }),
  ]);
  s.quotes[quoteKey("actual", "USD", "TEST", "NYSE")] = {
    ...quote,
    current: 210,
    previous: 205,
  };
  const m = calc(s);
  assert.equal(m.positions.length, 2);
  assert.equal(m.value, 2250);
  assert.equal(m.positions.find((p) => p.exchange === "NYSE").shares, 5);
});
test("EUR positions and virtual balances remain separate", () => {
  const s = setup([
    buy(),
    buy({ id: "b2", currency: "EUR", exchange: "XETRA", price: 90 }),
  ]);
  s.quotes[quoteKey("actual", "EUR", "TEST", "XETRA")] = {
    ...quote,
    current: 95,
    previous: 93,
  };
  const m = summary(s, "actual", "EUR");
  assert.equal(m.value, 950);
  assert.equal(m.initialInvestment, 900);
  assert.equal(m.total, 45);
  assert.equal(calc(s).value, 1200);
});
test("sale cannot reference a lot from a different exchange", () =>
  assert.throws(
    () =>
      validateTransaction(
        { ...buy(), id: "s1", type: "sell", lotId: "b1", exchange: "NYSE" },
        setup([buy()]),
      ),
    /Choose a purchase lot/,
  ));
test("quotes before a later sale cannot price the remaining exposure", () => {
  const s = setup([
    buy(),
    {
      ...buy(),
      id: "s1",
      type: "sell",
      lotId: "b1",
      date: "2026-01-07",
      shares: 4,
      price: 125,
      fee: 0,
    },
  ]);
  assert.equal(calc(s).value, null);
  assert.equal(calc(s).daily, null);
});
test("European session dates follow the selected market time zone", () =>
  assert.equal(marketDate("2026-01-07T01:00:00Z", "XETRA"), "2026-01-07"));
test("invalid imported notes are rejected before rendering", () =>
  assert.throws(
    () =>
      validateBackup({
        ...base(),
        transactions: [buy({ notes: { invalid: true } })],
      }),
    /notes/,
  ));
