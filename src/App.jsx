import useAutoRefresh from "./hooks/useAutoRefresh";
import ThemeToggle from "./components/ThemeToggle";
import { upgradeWorkspace } from "./lib/workspaces";
import { watchPositions } from "./lib/watchlists";
import { DEFAULT_REFRESH_MINUTES } from "./lib/refresh-settings";
import Watchlists from "./components/Watchlists";
import { currencies, instrumentKey } from "./lib/markets";
import { useState, useEffect, useMemo } from "react";
import {
  Home,
  ChartNoAxesColumnIncreasing,
  Star,
  BookOpen,
  FlaskConical,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Plus,
  Upload,
  Info,
  RefreshCw,
  Check,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import {
  summary,
  quoteKey,
  addSnapshot,
  money,
  download,
  csv,
  today,
} from "./lib/portfolio";
import { Metrics, Charts, Holdings } from "./components/Dashboard";
import { Modal } from "./components/Primitives";
import TradeForm from "./components/TradeForm";
import PositionDetail from "./components/PositionDetail";
import PriceForm from "./components/PriceForm";
import { Journal, Settings } from "./components/WorkspaceViews";
import ProfitLoss from "./components/ProfitLoss";
const nav = [
  ["Overview", Home],
  ["Holdings", ChartNoAxesColumnIncreasing],
  ["Watchlist", Star],
  ["Simulation", FlaskConical],
  ["Trade Journal", BookOpen],
  ["Profit & Loss", ChartNoAxesCombined],
  ["Settings", SettingsIcon],
];
const simulationViews = [
  "Positions",
  "Watchlists",
  "Transactions",
  "Performance",
];
export default function App({
  state,
  setState,
  saveError,
  member,
  memberControls,
  accountControls,
  isCloud = false,
  syncStatus,
}) {
  const [page, setPage] = useState("Overview"),
    [simulationView, setSimulationView] = useState("Positions"),
    [currency, setCurrency] = useState("USD"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [provider, setProvider] = useState(null),
    [mobile, setMobile] = useState(false);
  const isSimulation = page === "Simulation";
  const portfolio = isSimulation ? "simulated" : "actual";
  const showPerformance =
    page === "Overview" || (isSimulation && simulationView === "Performance");
  const showPositions =
    page === "Holdings" || (isSimulation && simulationView === "Positions");
  const showWatchlists =
    page === "Watchlist" || (isSimulation && simulationView === "Watchlists");
  const showJournal =
    page === "Trade Journal" ||
    (isSimulation && simulationView === "Transactions");
  const m = useMemo(
    () => summary(state, portfolio, currency),
    [state, portfolio, currency],
  );
  const refreshStatus = useAutoRefresh(state, setState);
  const refreshMinutes = state.refreshMinutes ?? DEFAULT_REFRESH_MINUTES;
  const watched = modal?.watchId
    ? state.watchlist.find((w) => w.id === modal.watchId)
    : null;
  const detailPosition = watched
    ? watchPositions(state, portfolio, currency, watched.listId).find(
        (p) => p.watchId === watched.id,
      )
    : m.positions.find((p) => p.key === modal?.key);
  const saveStockNotes = (p, html) =>
    setState((current) => ({
      ...current,
      stockNotes: {
        ...current.stockNotes,
        [quoteKey(portfolio, currency, p.symbol, p.exchange)]: html,
      },
    }));
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setProvider)
      .catch(() => setProvider({ configured: false }));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function change(next, message) {
    setState(next);
    if (message) setToast(message);
  }
  function navigate(nextPage) {
    setPage(nextPage);
    if (nextPage === "Simulation" && !isSimulation)
      setSimulationView("Positions");
    setMobile(false);
  }
  function saveTrade(t) {
    change(
      (current) =>
        addSnapshot(
          { ...current, transactions: [...current.transactions, t] },
          t.portfolio,
          t.currency,
        ),
      `${t.type === "buy" ? "Purchase" : t.type === "sell" ? "Sale" : "Dividend"} recorded`,
    );
    setCurrency(t.currency);
    if (modal?.closeLot) navigate("Profit & Loss");
    setModal(null);
  }
  function savePlatform(id, platform) {
    change(
      (current) => ({
        ...current,
        transactions: current.transactions.map((t) =>
          t.id === id ? { ...t, platform } : t,
        ),
      }),
      "Trade platform saved",
    );
  }
  function savePrices(q, error) {
    change(
      addSnapshot(
        { ...state, quotes: { ...state.quotes, ...q } },
        portfolio,
        currency,
      ),
      error
        ? `Some prices updated. ${error}`
        : "Prices updated and performance snapshot saved",
    );
    setModal(null);
  }
  function openPrice(symbol) {
    setModal({
      type: "prices",
      symbols: symbol
        ? [symbol]
        : [
            ...new Set([
              ...m.open.map((p) => p.key),
              ...state.watchlist
                .filter(
                  (w) => w.portfolio === portfolio && w.currency === currency,
                )
                .map((w) => instrumentKey(w.symbol, w.exchange)),
            ]),
          ],
    });
  }
  function openBuy(position) {
    setModal({
      type: "trade",
      initialType: "buy",
      position: position?.lots
        ? position
        : position
          ? { ...position, lots: [] }
          : undefined,
    });
  }
  function exportData() {
    const rows = [
      [
        "Portfolio",
        "Currency",
        "Market / exchange",
        "Symbol",
        "Company name",
        "Date of purchase",
        "Shares purchased",
        "Shares remaining",
        "Purchase price",
        "Initial investment (shares x purchase price)",
        "Purchase fees",
        "Total purchase investment",
        "Current price",
        "Quote source",
        "Quote timestamp",
        "Stock daily change",
        "Stock daily change %",
        "Investment daily P/L (position)",
        "Investment daily P/L % (position)",
        "Lifetime investment P/L (position)",
        "Lifetime investment P/L % (position)",
        "Remaining market value (position)",
      ],
    ];
    for (const p of m.positions) {
      for (const l of p.lots)
        rows.push([
          portfolio,
          currency,
          p.exchange,
          p.symbol,
          p.name,
          l.date,
          l.shares,
          l.remaining,
          l.price,
          l.shares * l.price,
          l.fee,
          l.shares * l.price + l.fee,
          p.quote?.current,
          p.quote?.source,
          p.quote?.asOf,
          p.priceChange,
          p.priceChangePct,
          p.daily,
          p.dailyPct,
          p.total,
          p.totalPct,
          p.value,
        ]);
    }
    download(
      `folio-${portfolio}-${currency}-${today()}.csv`,
      csv(rows),
      "text/csv;charset=utf-8",
    );
    setToast(
      "Holdings exported. Position totals repeat across purchase lots; do not sum those columns.",
    );
  }
  const demo = portfolio === "simulated" && currency === "USD" && state.demo;
  const manual = m.open.some((p) => p.quote?.source === "Manual"),
    sample = m.open.some((p) => p.quote?.source === "Sample");
  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobile ? "mobile-open" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMobile(false);
        }}
      >
        <button
          className="icon-button sidebar-close mobile-menu"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={19} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <img src="/apple-touch-icon.png" width="35" height="35" alt="" />
          Folio<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "selected" : ""}
              aria-current={page === label ? "page" : undefined}
              onClick={() => navigate(label)}
            >
              <Icon size={19} strokeWidth={1.7} />
              {label}
              {page === label && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <section className="sidebar-prices" aria-label="Price updates">
          <div className="data-banner">
            <div>
              <Info size={16} />
              <span>
                {demo ? (
                  <>
                    <strong>
                      {sample ? "Sample portfolio" : "Sample purchases"}
                    </strong>
                    <span className="banner-divider">·</span>
                    {sample
                      ? "Illustrative prices, not live market data"
                      : "Web quotes · example transactions"}
                  </>
                ) : (
                  <>
                    <strong>
                      {sample
                        ? "Sample prices"
                        : manual
                          ? "Manual prices"
                          : "Your portfolio"}
                    </strong>
                    <span className="banner-divider">·</span>
                    {m.missing
                      ? "Add prices to calculate your returns"
                      : sample
                        ? "Illustrative prices, not live market data"
                        : manual
                          ? "Returns use your last saved quotes"
                          : provider?.configured
                            ? "Update prices to fetch the latest available quotes"
                            : "Manual price updates available"}
                  </>
                )}
              </span>
            </div>
            <button onClick={() => openPrice()}>
              <RefreshCw size={15} />
              Update prices
            </button>
          </div>
          <div className="refresh-status">
            <span>
              <i className={refreshStatus.busy ? "refreshing" : ""} />
              {refreshStatus.busy
                ? "Updating web prices..."
                : state.autoRefresh
                  ? `Automatic web updates · every ${refreshMinutes} minute${refreshMinutes === 1 ? "" : "s"}`
                  : "Automatic updates paused"}
              {state.lastRefresh &&
                ` · Last checked ${new Date(state.lastRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
            <button
              className="text-button"
              disabled={refreshStatus.busy}
              onClick={refreshStatus.refresh}
            >
              <RefreshCw size={13} />
              Refresh now
            </button>
          </div>
        </section>
        <section className="sidebar-account" aria-label="Workspace and account">
          {memberControls}
          <div className="sidebar-preferences">
            <label>
              Currency
              <select
                aria-label="Portfolio currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <ThemeToggle />
          </div>
          {accountControls}
        </section>
      </aside>
      {mobile && (
        <button
          aria-label="Dismiss navigation"
          tabIndex={-1}
          className="mobile-scrim"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <div className="page-content">
          <div className="page-heading">
            <div className="page-title">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                aria-expanded={mobile}
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <h1>{page === "Overview" ? "Your Portfolio" : page}</h1>
            </div>
            {page !== "Profit & Loss" && (
              <div className="heading-actions">
                <button className="button" onClick={exportData}>
                  <Upload size={16} />
                  Export
                </button>
                <button className="primary" onClick={() => openBuy()}>
                  <Plus size={18} />
                  Add purchase
                </button>
              </div>
            )}
          </div>
          {isSimulation && (
            <div className="portfolio-row">
              <div
                className="segmented simulation-views"
                role="group"
                aria-label="Simulation views"
              >
                {simulationViews.map((view) => (
                  <button
                    key={view}
                    aria-pressed={simulationView === view}
                    className={simulationView === view ? "active" : ""}
                    onClick={() => setSimulationView(view)}
                  >
                    {view}
                  </button>
                ))}
              </div>
              <span className="buying-power">
                <Wallet size={14} />
                Available cash <strong>{money(m.cash, currency)}</strong>
              </span>
            </div>
          )}
          {saveError && (
            <div className="error-banner" role="alert">
              {saveError}
              <button
                onClick={() =>
                  download("folio-emergency-backup.json", JSON.stringify(state))
                }
              >
                Download backup now
              </button>
            </div>
          )}
          {m.mixedDays && (showPerformance || showPositions) && (
            <div className="warning-banner">
              Quotes span different trading sessions. Update all prices to the
              same session to calculate a portfolio daily return.
            </div>
          )}
          {refreshStatus.errors.length > 0 && (
            <details className="warning-banner">
              <summary>
                {refreshStatus.errors.length} price update(s) could not be
                completed. Last saved prices retained.
              </summary>
              {refreshStatus.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </details>
          )}
          {(showPerformance || showPositions) && (
            <>
              <Metrics metrics={m} currency={currency} />
              {showPerformance && (
                <Charts
                  state={state}
                  portfolio={portfolio}
                  currency={currency}
                  metrics={m}
                />
              )}
              <Holdings
                key={page}
                positions={m.positions}
                currency={currency}
                expanded={showPositions}
                onAdd={() => openBuy()}
                onDetail={(p) => setModal({ type: "detail", key: p.key })}
                showNotes={showPositions}
                notes={state.stockNotes}
                portfolio={portfolio}
              />
              {showPositions && (
                <div className="realized-strip">
                  <span>
                    Realized gains{" "}
                    <strong
                      className={m.realized >= 0 ? "positive" : "negative"}
                    >
                      {money(m.realized, currency, true)}
                    </strong>
                  </span>
                  <span>
                    Dividend income{" "}
                    <strong>{money(m.dividends, currency)}</strong>
                  </span>
                  <span>
                    All purchase outlays{" "}
                    <strong>{money(m.outlay, currency)}</strong>
                  </span>
                </div>
              )}
            </>
          )}
          {showWatchlists && (
            <Watchlists
              key={portfolio}
              state={state}
              portfolio={portfolio}
              currency={currency}
              onChange={change}
              onDetail={(p) =>
                setModal({ type: "detail", key: p.key, watchId: p.watchId })
              }
              onBuy={(p) => openBuy(p.watchOnly ? { ...p, lots: [] } : p)}
            />
          )}
          {showJournal && (
            <Journal
              key={portfolio}
              state={state}
              portfolio={portfolio}
              currency={currency}
              positions={m.positions}
              onCloseTrade={
                isSimulation
                  ? undefined
                  : (lot) =>
                      setModal({
                        type: "trade",
                        closeLot: lot,
                      })
              }
              onPlatformChange={isSimulation ? undefined : savePlatform}
              onDelete={(t) => {
                if (
                  state.transactions.some(
                    (s) => s.type === "sell" && s.lotId === t.id,
                  )
                ) {
                  setToast(
                    "Delete the sales linked to this purchase first, so the ledger stays consistent.",
                  );
                  return;
                }
                setModal({
                  type: "confirm",
                  title: "Delete this transaction?",
                  text: `Remove the ${t.symbol} ${t.type} dated ${t.date}. Your balances and returns will be recalculated. Existing historical snapshots are retained.`,
                  action: () => {
                    change(
                      addSnapshot(
                        {
                          ...state,
                          transactions: state.transactions.filter(
                            (x) => x.id !== t.id,
                          ),
                        },
                        portfolio,
                        currency,
                      ),
                      "Transaction deleted",
                    );
                    setModal(null);
                  },
                });
              }}
            />
          )}
          {page === "Profit & Loss" && (
            <ProfitLoss transactions={state.transactions} />
          )}
          {page === "Settings" && (
            <Settings
              state={state}
              provider={provider}
              onChange={change}
              memberName={member.name}
              isCloud={isCloud}
              onRestore={(s) =>
                setModal({
                  type: "confirm",
                  title: "Restore this backup?",
                  text: `Replace this workspace with ${s.transactions.length} transactions and ${s.watchlist.length} watchlist entries from the backup. Download your current backup first if you want to keep it.`,
                  action: () => {
                    change(upgradeWorkspace(s), "Backup restored");
                    setModal(null);
                  },
                })
              }
              onClear={() =>
                setModal({
                  type: "confirm",
                  title: "Clear your simulated portfolio?",
                  text: "This removes every simulated transaction, price, watchlist entry, and performance snapshot in USD, CAD, and EUR. Actual holdings are kept.",
                  action: () => {
                    change(
                      {
                        ...state,
                        demo: false,
                        transactions: state.transactions.filter(
                          (t) => t.portfolio !== "simulated",
                        ),
                        quotes: Object.fromEntries(
                          Object.entries(state.quotes).filter(
                            ([k]) => !k.startsWith("simulated:"),
                          ),
                        ),
                        watchlist: state.watchlist.filter(
                          (w) => w.portfolio !== "simulated",
                        ),
                        snapshots: state.snapshots.filter(
                          (s) => s.portfolio !== "simulated",
                        ),
                      },
                      "Simulation cleared. Ready for your first investment.",
                    );
                    setModal(null);
                  },
                })
              }
            />
          )}
          <footer>
            <span>
              <span className={`saved-dot ${saveError ? "failed" : ""}`}>
                <Check size={10} />
              </span>
              {isCloud
                ? syncStatus
                : saveError
                  ? "Changes not saved"
                  : "Saved on this device"}
            </span>
            {page === "Profit & Loss" ? (
              <span>Exchange-local dates</span>
            ) : (
              <span>
                Folio · Your personal stock workspace
                <span className="footer-sep">|</span>
                {currency} · Exchange-local dates
              </span>
            )}
          </footer>
        </div>
      </main>
      {modal?.type === "trade" && (
        <TradeForm
          state={state}
          portfolio={portfolio}
          currency={currency}
          position={modal.position}
          closeLot={modal.closeLot}
          initialType={modal.initialType}
          onSave={saveTrade}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "detail" && detailPosition && (
        <PositionDetail
          position={detailPosition}
          currency={currency}
          onClose={() => setModal(null)}
          onQuote={() => openPrice(modal.key)}
          notes={
            state.stockNotes[
              quoteKey(
                portfolio,
                currency,
                detailPosition.symbol,
                detailPosition.exchange,
              )
            ] || ""
          }
          onNotesChange={(html) => saveStockNotes(detailPosition, html)}
          watchOnly={detailPosition.watchOnly}
          onTrade={(type) =>
            setModal({
              type: "trade",
              initialType: type,
              position: detailPosition?.watchOnly
                ? { ...detailPosition, lots: [] }
                : detailPosition,
            })
          }
        />
      )}
      {modal?.type === "prices" && (
        <PriceForm
          state={state}
          portfolio={portfolio}
          currency={currency}
          symbols={modal.symbols}
          provider={provider}
          onSave={savePrices}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "confirm" && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <div className="form-body">
            <p>{modal.text}</p>
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="primary" onClick={modal.action}>
              Confirm
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
