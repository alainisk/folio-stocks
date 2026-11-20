import { localWorkspaceFixture } from "./local-workspace-fixture.mjs";
import { createMembers } from "../src/lib/workspaces.js";
import { chromium, expect } from "@playwright/test";
import { initialState } from "../src/lib/seed.js";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await localWorkspaceFixture(page);
const starting = createMembers();
starting.members[0].workspace.autoRefresh = false;
await page.addInitScript((d) => {
  if (!localStorage.getItem("folio.members.v2"))
    localStorage.setItem("folio.members.v2", JSON.stringify(d));
}, starting);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
await page.goto(process.env.FOLIO_QA_URL || "http://localhost:5173");
const navigation = page.getByRole("navigation", { name: "Main navigation" });
await expect(navigation.getByRole("button")).toHaveText([
  "Overview",
  "Holdings",
  "Watchlist",
  "Simulation",
  "Trade Journal",
  "Profit & Loss",
  "Settings",
]);
await expect(button("View NVDA NASDAQ details")).toHaveCount(0);
await button("Simulation").click();
await expect(button("View NVDA NASDAQ details")).toBeVisible();
await expect(page.getByText("Available cash")).toBeVisible();
await button("Watchlists").click();
await expect(button("View TSLA NASDAQ details")).toBeVisible();
await button("New watchlist").click();
await page.getByLabel("Watchlist name").fill("Paper ideas");
await button("Save watchlist").click();
await button("Transactions").click();
await expect(page.getByRole("table")).toContainText("Apple Inc.");
await expect(button("Close Trade")).toHaveCount(0);
await button("Performance").click();
await expect(button("1D")).toBeVisible();
await button("1D").click();
await expect(button("1D")).toHaveAttribute("aria-pressed", "true");
await button("3M").click();
await button("Holdings").click();
await expect(page.getByRole("group", { name: "Simulation views" })).toHaveCount(
  0,
);
await button("Add purchase").first().click();
await page
  .getByLabel("Market / exchange", { exact: true })
  .selectOption("XETRA");
await expect(page.getByLabel("Purchase currency", { exact: true })).toHaveValue(
  "EUR",
);
await page.getByLabel("Stock symbol", { exact: true }).fill("SAP");
await page.getByLabel("Company name", { exact: true }).fill("SAP SE");
await page.getByLabel("Number of shares", { exact: true }).fill("10");
await page
  .getByLabel("Purchase price per share (EUR)", { exact: true })
  .fill("100");
await page.getByLabel("Fees (EUR)", { exact: true }).fill("5");
await page.getByLabel("Trade platform (optional)").fill("Test Broker");
await expect(
  page.getByText("Initial investment: €1,000.00", { exact: false }),
).toBeVisible();
await button("Save purchase").click();
await expect(
  page.getByRole("combobox", { name: "Portfolio currency" }),
).toHaveValue("EUR");
await expect(button("View SAP XETRA details")).toBeVisible();
await button("Update prices").click();
await page.getByLabel("SAP XETRA current price", { exact: true }).fill("120");
await page.getByLabel("SAP XETRA previous close", { exact: true }).fill("110");
await button("Save selected prices").click();
await expect(page.locator(".metrics")).toContainText("€1,200.00");
await expect(page.locator(".metrics")).toContainText("€1,000.00");
await expect(page.locator(".metrics")).toContainText("+€195.00");
await button("View SAP XETRA details").click();
await button("Record sale").click();
await page.getByLabel("Number of shares", { exact: true }).fill("4");
await page
  .getByLabel("Sale price per share (EUR)", { exact: true })
  .fill("115");
await page.getByLabel("Fees (EUR)", { exact: true }).fill("2");
await button("Save sale").click();
await expect(page.locator(".metrics")).toContainText("€720.00");
await expect(page.locator(".metrics")).toContainText("+€173.00");
await button("Profit & Loss").click();
const saleRow = page.getByRole("row").filter({ hasText: "SAP SE" });
await expect(saleRow).toContainText("+€56.00");
await expect(saleRow).toContainText("+13.93%");
await expect(saleRow).toContainText("€100.50");
await expect(saleRow).toContainText("€400.00");
await expect(saleRow).toContainText("Test Broker");
await expect(saleRow).toContainText("Profit");
await page.getByLabel("Trade currency", { exact: true }).selectOption("USD");
await expect(
  page.getByRole("heading", { name: "No matching sales" }),
).toBeVisible();
await button("Trade Journal").click();
await expect(page.getByRole("group", { name: "Simulation views" })).toHaveCount(
  0,
);
await page
  .getByRole("button", { name: /Edit trade platform for SAP purchase/ })
  .click();
await page.getByLabel("Trade platform (optional)").fill("Updated Broker");
await button("Save platform").click();
await button("Profit & Loss").click();
await expect(saleRow).toContainText("Updated Broker");
await button("Holdings").click();
await button("View SAP XETRA details").click();
await button("Add dividend").click();
await page.getByLabel("Dividend received (EUR)", { exact: true }).fill("20");
await button("Save dividend").click();
await expect(page.locator(".metrics")).toContainText("+€193.00");
await page.reload();
await button("Profit & Loss").click();
await expect(saleRow).toContainText("Updated Broker");
await button("Holdings").click();
await page
  .getByRole("combobox", { name: "Portfolio currency" })
  .selectOption("EUR");
await expect(page.locator(".metrics")).toContainText("+€193.00");
await page
  .getByRole("combobox", { name: "Portfolio currency" })
  .selectOption("CAD");
await expect(
  page.getByRole("heading", { name: "Make your first move" }),
).toBeVisible();
await page
  .getByRole("combobox", { name: "Portfolio currency" })
  .selectOption("EUR");
await button("Trade Journal").click();
await button("Close Trade").click();
const closeTrade = page.getByRole("dialog", { name: "Close Trade" });
await expect(closeTrade.getByLabel("Shares sold")).toHaveValue("6");
await button("Cancel").click();
await expect(closeTrade).toHaveCount(0);

await button("Add purchase").click();
await page.getByLabel("Market / exchange").selectOption("XETRA");
await page.getByLabel("Stock symbol").fill("SAP");
await page.getByLabel("Company name").fill("SAP SE");
await page.getByLabel("Date of purchase").fill("2024-11-01");
await page.getByLabel("Number of shares").fill("3.5");
await page.getByLabel("Purchase price per share (EUR)").fill("75");
await page.getByLabel("Fees (EUR)").fill("1.75");
await button("Save purchase").click();
const purchaseLot = page.getByRole("row").filter({ hasText: "2024-11-01" });
await purchaseLot.getByRole("button", { name: "Close Trade" }).click();
await expect(closeTrade.getByLabel("Shares sold")).toHaveValue("3.5");
await expect(closeTrade.getByLabel("Sale date")).toHaveValue("");
await expect(closeTrade.getByLabel("Sale price per share (EUR)")).toHaveValue(
  "",
);
await closeTrade.getByLabel("Sale date").fill("2024-11-08");
await closeTrade.getByLabel("Sale price per share (EUR)").fill("70");
await closeTrade.getByLabel("Fees (EUR)").fill("0.75");
await button("Save sale").click();
await expect(
  page.getByRole("heading", { name: "Profit & Loss", exact: true }),
).toBeVisible();
const closedSale = page.getByRole("row").filter({ hasText: "2024-11-08" });
await expect(closedSale).toContainText("2024-11-01");
await expect(closedSale).toContainText("€70.00");
await expect(closedSale).toContainText("-€20.00");
await expect(page.getByRole("row").filter({ hasText: "SAP SE" })).toHaveCount(
  2,
);
const editSale = page.getByRole("dialog", { name: "Edit sale" });
await closedSale.getByRole("button", { name: "Edit sale" }).click();
await expect(editSale.getByLabel("Sale date")).toHaveValue("2024-11-08");
await expect(editSale.getByLabel("Sale price per share (EUR)")).toHaveValue(
  "70",
);
await editSale.getByLabel("Sale date").fill("2024-10-31");
await button("Save changes").click();
await expect(editSale).toBeVisible();
await button("Cancel").click();
await expect(closedSale).toContainText("-€20.00");

await closedSale.getByRole("button", { name: "Edit sale" }).click();
await editSale.getByLabel("Sale date").fill("2024-11-12");
await editSale.getByLabel("Sale price per share (EUR)").fill("85");
await button("Save changes").click();
const correctedSale = page.getByRole("row").filter({ hasText: "2024-11-12" });
await expect(closedSale).toHaveCount(0);
await expect(correctedSale).toContainText("€85.00");
await expect(correctedSale).toContainText("+€32.50");
await expect(correctedSale).toContainText("+12.30%");
await page.reload();
await button("Profit & Loss").click();
await expect(correctedSale).toContainText("+€32.50");
await expect(page.getByRole("row").filter({ hasText: "SAP SE" })).toHaveCount(
  2,
);
await page.getByLabel("Portfolio currency").selectOption("EUR");
await button("Trade Journal").click();
const journalSale = page.getByRole("row").filter({ hasText: "2024-11-12" });
await expect(journalSale).toContainText("€85.00");
await expect(
  purchaseLot.getByRole("button", { name: "Close Trade" }),
).toHaveCount(0);
await expect(button("Close Trade")).toHaveCount(1);

await button("Watchlist").click();
await expect(page.getByRole("group", { name: "Simulation views" })).toHaveCount(
  0,
);
await expect(button("View TSLA NASDAQ details")).toHaveCount(0);
await expect(page.getByRole("button", { name: /Paper ideas/ })).toHaveCount(0);
await button("Add symbol").first().click();
await page.getByLabel("Market / exchange", { exact: true }).selectOption("EPA");
await page.getByLabel("Symbol", { exact: true }).fill("MC");
await page.getByLabel("Company name", { exact: true }).fill("LVMH");
await page
  .getByLabel("Target price (EUR, optional)", { exact: true })
  .fill("500");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Add symbol", exact: true })
  .click();
await button("View MC EPA details").click();
await button("Update price").click();
await page.getByLabel("MC EPA current price", { exact: true }).fill("480");
await page.getByLabel("MC EPA previous close", { exact: true }).fill("490");
await button("Save selected prices").click();
await expect(page.getByText(/Target reached/)).toBeVisible();
await button("Holdings").click();
await expect(
  page.getByRole("columnheader", { name: "Initial investment", exact: true }),
).toBeVisible();
const dl = page.waitForEvent("download");
await button("Export").click();
const d = await dl;
if (!d.suggestedFilename().endsWith(".csv")) throw Error("CSV export missing");
await button("Watchlist").click();
await button("Delete watchlist").click();
await button("Confirm").click();
await page.getByLabel("Portfolio currency").selectOption("USD");
await button("Simulation").click();
await button("Watchlists").click();
await expect(button("View TSLA NASDAQ details")).toBeVisible();
await expect(page.getByRole("button", { name: /Paper ideas/ })).toBeVisible();
await button("Settings").click();
await page.locator("input[type=file]").setInputFiles({
  name: "clean.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(initialState())),
});
await button("Confirm").click();
await button("Overview").click();
await expect(
  page.getByRole("heading", { name: "Make your first move" }),
).toBeVisible();
await page
  .getByRole("combobox", { name: "Portfolio currency" })
  .selectOption("USD");
await button("Simulation").click();
await expect(button("View NVDA NASDAQ details")).toBeVisible();
await page.setViewportSize({ width: 390, height: 844 });
await expect(button("Open navigation")).toBeVisible();
await button("Open navigation").click();
await page
  .getByRole("navigation")
  .getByRole("button", { name: "Holdings", exact: true })
  .click();
await expect(
  page.getByRole("heading", { name: "Holdings", exact: true, level: 1 }),
).toBeVisible();
await button("Open navigation").click();
await navigation
  .getByRole("button", { name: "Profit & Loss", exact: true })
  .click();
await expect(
  page.getByRole("heading", { name: "No sales recorded" }),
).toBeVisible();
const dims = await page.evaluate(() => ({
  width: innerWidth,
  scroll: document.documentElement.scrollWidth,
}));
if (dims.width !== dims.scroll)
  throw Error(`Mobile overflow: ${JSON.stringify(dims)}`);
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS: navigation, simulation isolation, 1D chart, EUR purchase, sale P/L, journal Close Trade, Edit sale and persistence, trade platform, manual quote, dividend, CAD separation, watchlist target, CSV export, backup restore and mobile navigation. No browser errors.",
);
await browser.close();
