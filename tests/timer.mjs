import { localWorkspaceFixture } from "./local-workspace-fixture.mjs";
import { chromium, expect } from "@playwright/test";
import { createMembers, emptyWorkspace } from "../src/lib/workspaces.js";
const b = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
const p = await b.newPage();
await localWorkspaceFixture(p);
const start = new Date(Date.now() + 60_000);
await p.clock.install({ time: new Date() });
await p.clock.pauseAt(start);
const workspace = emptyWorkspace();
workspace.lastRefresh = start.toISOString();
workspace.watchlist.push({
  id: "refresh-test",
  symbol: "AAPL",
  exchange: "NASDAQ",
  currency: "USD",
  portfolio: "actual",
  name: "Apple Inc.",
  target: null,
  direction: "below",
});
await p.addInitScript((data) => {
  if (!localStorage.getItem("folio.members.v2"))
    localStorage.setItem("folio.members.v2", JSON.stringify(data));
}, createMembers(workspace));
let calls = 0;
await p.route("**/api/quote?**", async (r) => {
  calls++;
  const u = new URL(r.request().url());
  await r.fulfill({
    json: {
      current: 300,
      previous: 290,
      asOf: start.toISOString(),
      currency: u.searchParams.get("currency"),
      source: "Yahoo Finance",
    },
  });
});
await p.goto(process.env.FOLIO_QA_URL || "http://localhost:5173");
const settings = p.getByRole("button", { name: "Settings", exact: true });
const interval = p.getByLabel("Refresh interval");
const autoRefresh = p.getByLabel("Automatic price updates");
const refreshButton = p.getByRole("button", { name: "Refresh now" });

async function expectRefresh(count) {
  await expect.poll(() => calls).toBe(count);
  await expect(refreshButton).toBeEnabled();
}

await settings.click();
await expect(interval).toHaveValue("15");
await p.clock.fastForward(899_999);
expect(calls).toBe(0);
await p.clock.fastForward(1);
await expectRefresh(1);

await interval.selectOption("1");
await expect(p.locator(".refresh-status")).toContainText("every 1 minute ·");
await p.clock.fastForward(59_999);
expect(calls).toBe(1);
await p.clock.fastForward(1);
await expectRefresh(2);
await p.clock.fastForward(60_000);
await expectRefresh(3);

await p.clock.fastForward(30_000);
await interval.selectOption("15");
await expect(p.locator(".refresh-status")).toContainText("every 15 minutes");
await p.clock.fastForward(869_999);
expect(calls).toBe(3);
await p.clock.fastForward(1);
await expectRefresh(4);

await interval.selectOption("1");
await autoRefresh.uncheck();
await p.clock.fastForward(180_000);
expect(calls).toBe(4);
await autoRefresh.check();
await p.clock.runFor(1);
await expectRefresh(5);

await p.context().setOffline(true);
await p.clock.fastForward(60_000);
expect(calls).toBe(5);
await p.context().setOffline(false);
await p.clock.runFor(1);
await expectRefresh(6);

await p.reload();
await settings.click();
await expect(interval).toHaveValue("1");
expect(calls).toBe(6);
console.log(
  "PASS: 15-minute default, recurring 1-minute refresh, live interval changes, pause, reconnect and persistence.",
);
await b.close();
