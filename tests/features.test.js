import test from "node:test";
import assert from "node:assert/strict";
import {
  upgradeWorkspace,
  createMembers,
  emptyWorkspace,
  validateMembers,
} from "../src/lib/workspaces.js";
import { initialState } from "../src/lib/seed.js";
import {
  DEFAULT_REFRESH_MINUTES,
  refreshDelay,
} from "../src/lib/refresh-settings.js";
import { fetchPrices, applyPrices } from "../src/lib/refresh.js";
import { quoteKey, validateBackup } from "../src/lib/portfolio.js";
import { providerSymbol, chart, PERIODS } from "../server/market-data.js";
import { watchPositions } from "../src/lib/watchlists.js";
test("refresh deadlines follow the selected interval", () => {
  const now = Date.now();
  assert.equal(DEFAULT_REFRESH_MINUTES, 15);
  assert.equal(refreshDelay(0, DEFAULT_REFRESH_MINUTES, now), 0);
  assert.equal(refreshDelay(now - 899999, DEFAULT_REFRESH_MINUTES, now), 1);
  assert.equal(refreshDelay(now - 900000, DEFAULT_REFRESH_MINUTES, now), 0);
  assert.equal(refreshDelay(now - 59999, 1, now), 1);
  assert.equal(refreshDelay(now - 60000, 1, now), 0);
});
test("backups preserve valid refresh intervals and accept older workspaces", () => {
  const workspace = emptyWorkspace();
  assert.doesNotThrow(() => validateBackup(workspace));
  for (const refreshMinutes of [1, 7, 15]) {
    const saved = { ...workspace, refreshMinutes };
    assert.equal(validateBackup(saved).refreshMinutes, refreshMinutes);
    assert.equal(upgradeWorkspace(saved).refreshMinutes, refreshMinutes);
  }
  for (const refreshMinutes of [0, 1.5, 16, "1", null])
    assert.throws(
      () => validateBackup({ ...workspace, refreshMinutes }),
      /Invalid refresh interval/,
    );
});
test("workspace migration preserves original trades and adds named watchlists", () => {
  const s = initialState(),
    u = upgradeWorkspace(s);
  assert.deepEqual(u.transactions, s.transactions);
  assert.deepEqual(
    u.watchlists.map((l) => l.name),
    ["General", "Too Late", "Too Early", "Now"],
  );
  assert.equal(u.watchlist[0].listId, "general");
  assert.doesNotThrow(() => validateBackup(u));
});
test("members own independent arrays, notes, budgets and watchlists", () => {
  const a = emptyWorkspace(),
    b = emptyWorkspace();
  a.stockNotes["simulated:USD:NASDAQ:AAPL"] = "<p>private idea</p>";
  a.watchlists.push({ id: "a", name: "Only A" });
  assert.deepEqual(b.stockNotes, {});
  assert.equal(b.watchlists.length, 4);
  const m = createMembers();
  m.members.push({ id: "two", name: "Second", workspace: b });
  assert.doesNotThrow(() => validateMembers(m));
});
test("all ten chart periods are supported", () =>
  assert.deepEqual(Object.keys(PERIODS), [
    "1D",
    "1W",
    "1M",
    "3M",
    "6M",
    "1Y",
    "3Y",
    "5Y",
    "10Y",
    "ALL",
  ]));
test("provider symbols match local exchange and reject mismatched suffixes", () => {
  assert.equal(providerSymbol("RY", "TSX"), "RY.TO");
  assert.equal(providerSymbol("SAP", "XETRA"), "SAP.DE");
  assert.equal(providerSymbol("MC", "EPA"), "MC.PA");
  assert.throws(() => providerSymbol("RY.TO", "XETRA"));
});
test("Anthropic's saved ticker uses ANT for quotes and history", async () => {
  const marketTime = 1795112820;
  const fetcher = async (url) => {
    assert.equal(new URL(url).pathname, "/v8/finance/chart/ANT");
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                symbol: "ANT",
                currency: "USD",
                exchangeName: "NMS",
                regularMarketTime: marketTime,
                regularMarketPrice: 95.92,
                previousClose: 83,
              },
              timestamp: [marketTime],
              indicators: { quote: [{ close: [95.92] }] },
            },
          ],
        },
      }),
    };
  };
  const saved = await chart("ANT-U", "NASDAQ", "USD", "1D", fetcher);
  assert.equal(saved.symbol, "ANT-U");
  assert.equal(saved.providerSymbol, "ANT");
  assert.equal(saved.current, 95.92);
  assert.equal(saved.points[0].value, 95.92);
  const listed = await chart("ANT", "NASDAQ", "USD", "1D", fetcher);
  assert.equal(listed.symbol, "ANT");
  await assert.rejects(
    () => chart("ANT", "NYSE", "USD", "1D", fetcher),
    /not NYSE/,
  );
  assert.equal(providerSymbol("ANT-U", "NYSE"), "ANT-U");
  assert.equal(providerSymbol("OTHER-U", "NASDAQ"), "OTHER-U");
});
test("an unrecognized ticker gets a listing error", async () => {
  await assert.rejects(
    () =>
      chart("UNLISTED", "NASDAQ", "USD", "1D", async () => ({
        ok: false,
        status: 404,
      })),
    /Check the ticker and exchange/,
  );
});
test("watchlist reference returns are hypothetical and never create transactions", () => {
  const s = emptyWorkspace();
  s.watchlist.push({
    id: "w",
    symbol: "SAP",
    exchange: "XETRA",
    currency: "EUR",
    portfolio: "actual",
    listId: "now",
    name: "SAP SE",
    referenceShares: 10,
    referencePrice: 100,
    referenceDate: "2026-01-01",
    target: null,
    direction: "below",
  });
  s.quotes[quoteKey("actual", "EUR", "SAP", "XETRA")] = {
    current: 120,
    previous: 110,
    asOf: new Date().toISOString(),
    source: "Yahoo Finance",
  };
  const p = watchPositions(s, "actual", "EUR", "now")[0];
  assert.equal(p.watchOnly, true);
  assert.equal(p.initialInvestment, 1000);
  assert.equal(p.total, 200);
  assert.equal(p.daily, 100);
  assert.equal(s.transactions.length, 0);
});
test("automatic refresh deduplicates instruments and isolates failed quotes", async () => {
  const s = emptyWorkspace();
  s.watchlist = [
    {
      id: "w1",
      symbol: "AAPL",
      exchange: "NASDAQ",
      currency: "USD",
      portfolio: "actual",
      listId: "now",
    },
    {
      id: "w2",
      symbol: "AAPL",
      exchange: "NASDAQ",
      currency: "USD",
      portfolio: "simulated",
      listId: "general",
    },
    {
      id: "w3",
      symbol: "FAIL",
      exchange: "NASDAQ",
      currency: "USD",
      portfolio: "actual",
      listId: "general",
    },
  ];
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    return {
      ok: !url.includes("FAIL"),
      json: async () =>
        url.includes("FAIL")
          ? { error: "unavailable" }
          : {
              current: 120,
              previous: 110,
              asOf: new Date().toISOString(),
              source: "Yahoo Finance",
              currency: "USD",
            },
    };
  };
  const r = await fetchPrices(s, { fetcher });
  assert.equal(calls, 2);
  assert.equal(Object.keys(r.quotes).length, 2);
  assert.equal(r.errors.length, 1);
});
test("late refresh results never resurrect a removed stock", () => {
  const s = emptyWorkspace(),
    next = applyPrices(s, {
      [quoteKey("actual", "USD", "AAPL", "NASDAQ")]: {
        current: 200,
        previous: 190,
        asOf: new Date().toISOString(),
        source: "Yahoo Finance",
      },
    });
  assert.deepEqual(next.quotes, {});
});
test("market data rejects wrong currency before using web prices", async () => {
  const fake = async () => ({
    ok: true,
    json: async () => ({ chart: { result: [{ meta: { currency: "USD" } }] } }),
  });
  await assert.rejects(
    () => chart("UNIQUE", "NASDAQ", "EUR", "1D", fake),
    /quoted in USD, not EUR/,
  );
});
test("market data rejects a different exchange", async () => {
  const fake = async () => ({
    ok: true,
    json: async () => ({
      chart: {
        result: [
          {
            meta: {
              currency: "USD",
              exchangeName: "NYQ",
              fullExchangeName: "NYSE",
            },
          },
        ],
      },
    }),
  });
  await assert.rejects(
    () => chart("DIFFERENT", "NASDAQ", "USD", "1D", fake),
    /not NASDAQ/,
  );
});

test("web refresh replaces illustrative history without a false market jump", () => {
  const s = upgradeWorkspace(initialState());
  const key = quoteKey("simulated", "USD", "AAPL", "NASDAQ");
  const result = applyPrices(s, {
    [key]: { ...s.quotes[key], source: "Yahoo Finance" },
  });
  assert.ok(s.snapshots.some((p) => p.illustrative));
  assert.ok(
    !result.snapshots.some(
      (p) =>
        p.illustrative && p.portfolio === "simulated" && p.currency === "USD",
    ),
  );
  assert.ok(result.snapshots.some((p) => !p.illustrative));
});
