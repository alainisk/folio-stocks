import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { currencies } from "../lib/markets";
import { money, quantity, realizedTrades } from "../lib/portfolio";
import { Company, Empty, Return } from "./Primitives";

export default function ProfitLoss({ transactions }) {
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("all");
  const trades = useMemo(
    () => realizedTrades(transactions, "actual"),
    [transactions],
  );
  const search = query.trim().toLowerCase();
  const rows = trades.filter(
    (trade) =>
      (currency === "all" || trade.currency === currency) &&
      `${trade.symbol} ${trade.name} ${trade.platform || ""}`
        .toLowerCase()
        .includes(search),
  );

  return (
    <section className="panel profit-loss">
      <div className="panel-head holdings-head">
        <div className="inline">
          <h2>Realized trades</h2>
          <span className="count">
            {rows.length} {rows.length === 1 ? "sale" : "sales"}
          </span>
        </div>
        {trades.length > 0 && (
          <div className="table-tools">
            <label className="search">
              <Search size={15} />
              <input
                aria-label="Search realized trades"
                placeholder="Search realized trades..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Trade currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="all">All currencies</option>
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {rows.length ? (
        <>
          <div
            className="table-scroll"
            role="region"
            aria-label="Realized trades table"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Company / market</th>
                  <th scope="col">Total return</th>
                  <th scope="col">Purchased</th>
                  <th scope="col">Sold</th>
                  <th scope="col">Shares</th>
                  <th scope="col">Avg. purchase</th>
                  <th scope="col">Initial investment</th>
                  <th scope="col">Currency</th>
                  <th scope="col">Trade platform</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((trade) => {
                  const displayedPct =
                    trade.totalPct == null
                      ? null
                      : Number(trade.totalPct.toFixed(2));
                  const outcome =
                    Number(trade.total.toFixed(2)) || displayedPct || 0;
                  return (
                    <tr key={trade.id}>
                      <td>
                        <Company {...trade} />
                      </td>
                      <td>
                        <Return
                          value={outcome ? trade.total : 0}
                          pct={displayedPct}
                          currency={trade.currency}
                        />
                        <span className="cell-note">
                          {outcome > 0
                            ? "Profit"
                            : outcome < 0
                              ? "Loss"
                              : "Break-even"}
                        </span>
                      </td>
                      <td>{trade.purchaseDate}</td>
                      <td>{trade.date}</td>
                      <td>{quantity(trade.shares)}</td>
                      <td>{money(trade.avgPurchase, trade.currency)}</td>
                      <td>{money(trade.initialInvestment, trade.currency)}</td>
                      <td>{trade.currency}</td>
                      <td className="platform-cell">{trade.platform || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            Returns include purchase and sale fees. Average purchase includes
            purchase fees. Initial investment is before fees.
          </div>
        </>
      ) : (
        <Empty
          title={trades.length ? "No matching sales" : "No sales recorded"}
          text={
            trades.length
              ? "Try a different search or currency."
              : "Record a sale from a holding to see its realized return here."
          }
        />
      )}
    </section>
  );
}
