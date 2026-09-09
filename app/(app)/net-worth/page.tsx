import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { loadNetWorthSummary, manilaToday } from "@/lib/net-worth";
import { deleteNetWorthSnapshot, saveNetWorthSnapshot } from "./actions";

function pct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.abs(value) < 10 && value !== 0 ? value.toFixed(1) : value.toFixed(0)}%`;
}

function months(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value < 10 ? 1 : 0)} mo`;
}

export default async function NetWorthPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const today = manilaToday();
  const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${today.slice(0, 7)}-01T00:00:00Z`));
  const [summary, { data: snapshots }] = await Promise.all([
    loadNetWorthSummary(supabase, today),
    supabase.from("net_worth_snapshots").select("id,snapshot_date,total_assets,total_liabilities,net_worth,notes").order("snapshot_date", { ascending: false }).limit(24),
  ]);

  const history = snapshots ?? [];
  const newest = history[0];
  const previous = history[1];
  const snapshotChange = newest && previous ? Number(newest.net_worth) - Number(previous.net_worth) : null;
  const oldest = history[history.length - 1];
  const totalChange = newest && oldest && newest.id !== oldest.id ? Number(newest.net_worth) - Number(oldest.net_worth) : null;
  const maxMagnitude = Math.max(...history.map((row) => Math.abs(Number(row.net_worth))), 1);

  return (
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">Financial position</div><h2>Net Worth</h2><p>Your personal balance sheet: what you own minus what you owe.</p></div>
        <div className="heading-actions"><Link className="secondary-btn" href="/reports">View reports</Link></div>
      </div>

      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards net-worth-stats">
        <div className="stat-card stat-income"><div className="stat-label">Total assets</div><div className="stat-value positive">{money(summary.totalAssets)}</div><div className="stat-foot">Accounts + receivables</div></div>
        <div className="stat-card stat-expense"><div className="stat-label">Total liabilities</div><div className="stat-value negative">{money(summary.totalLiabilities)}</div><div className="stat-foot">Cards + loans + overdrafts</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Net worth</div><div className={`stat-value ${summary.netWorth >= 0 ? "positive" : "negative"}`}>{money(summary.netWorth)}</div><div className="stat-foot">Assets − liabilities</div></div>
        <div className="stat-card"><div className="stat-label">Debt-to-asset</div><div className="stat-value">{pct(summary.debtToAssetRatio)}</div><div className="stat-foot">Lower is generally healthier</div></div>
      </section>

      <section className="grid-2 net-worth-grid">
        <div className="panel balance-sheet-panel">
          <div className="section-heading"><div><h3>Personal balance sheet</h3><p className="muted">Balances as of {today}.</p></div></div>
          <div className="balance-sheet-columns">
            <div className="balance-sheet-side"><h4>Assets</h4>
              <div className="balance-line"><span>Cash, bank, e-wallet & investments</span><strong>{money(summary.accountAssets)}</strong></div>
              <div className="balance-line"><span>Receivables / money owed to you</span><strong>{money(summary.receivables)}</strong></div>
              <div className="balance-total positive"><span>Total assets</span><strong>{money(summary.totalAssets)}</strong></div>
            </div>
            <div className="balance-sheet-side"><h4>Liabilities</h4>
              <div className="balance-line"><span>Credit cards</span><strong>{money(summary.creditCardDebt)}</strong></div>
              <div className="balance-line"><span>Loans payable</span><strong>{money(summary.loanDebt)}</strong></div>
              <div className="balance-line"><span>Negative account balances</span><strong>{money(summary.accountOverdrafts)}</strong></div>
              <div className="balance-total negative"><span>Total liabilities</span><strong>{money(summary.totalLiabilities)}</strong></div>
            </div>
          </div>
          <div className="net-worth-equation"><span>{money(summary.totalAssets)}</span><b>−</b><span>{money(summary.totalLiabilities)}</span><b>=</b><strong className={summary.netWorth >= 0 ? "positive" : "negative"}>{money(summary.netWorth)}</strong></div>
        </div>

        <div className="panel financial-health-panel">
          <div className="section-heading"><div><h3>Financial health this month</h3><p className="muted">Ratios use your current {monthLabel} activity.</p></div></div>
          <div className="health-metric"><div><span>Savings rate</span><strong>{pct(summary.savingsRate)}</strong></div><div className="progress-track"><div className="progress-bar savings-progress" style={{ width: `${Math.min(Math.max(summary.savingsRate, 0), 100)}%` }} /></div><small>Net savings ÷ income</small></div>
          <div className="health-metric"><div><span>Expense rate</span><strong>{pct(summary.expenseRate)}</strong></div><div className="progress-track"><div className="progress-bar expense-progress" style={{ width: `${Math.min(Math.max(summary.expenseRate, 0), 100)}%` }} /></div><small>Expenses ÷ income</small></div>
          <div className="health-cards">
            <div><span>Emergency fund</span><strong>{money(summary.emergencyFund)}</strong></div>
            <div><span>Coverage</span><strong>{months(summary.emergencyCoverageMonths)}</strong><small>vs. this month&apos;s expenses</small></div>
          </div>
        </div>
      </section>

      <section className="grid-2 net-worth-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="section-heading"><div><h3>Assets detail</h3><p className="muted">Open an item to review its activity.</p></div></div>
          <div className="position-list">
            {summary.accountRows.filter((row) => row.balance > 0).map((row) => <Link href={`/accounts/${row.id}`} className="position-row" key={`a-${row.id}`}><div><strong>{row.name}</strong><span>{row.account_type.replace("ewallet", "E-Wallet")}</span></div><strong className="positive">{money(row.balance)}</strong></Link>)}
            {summary.receivableRows.map((row) => <Link href={`/loans/${row.id}`} className="position-row" key={`r-${row.id}`}><div><strong>{row.name}</strong><span>Receivable</span></div><strong className="positive">{money(row.outstanding)}</strong></Link>)}
            {summary.accountAssets === 0 && summary.receivables === 0 && <div className="empty">No positive assets yet.</div>}
          </div>
        </div>
        <div className="panel">
          <div className="section-heading"><div><h3>Liabilities detail</h3><p className="muted">Balances that reduce your net worth.</p></div></div>
          <div className="position-list">
            {summary.cardRows.filter((row) => row.balance > 0).map((row) => <Link href={`/credit-cards/${row.id}`} className="position-row" key={`c-${row.id}`}><div><strong>{row.name}</strong><span>Credit card</span></div><strong className="negative">{money(row.balance)}</strong></Link>)}
            {summary.borrowedRows.map((row) => <Link href={`/loans/${row.id}`} className="position-row" key={`l-${row.id}`}><div><strong>{row.name}</strong><span>Loan payable</span></div><strong className="negative">{money(row.outstanding)}</strong></Link>)}
            {summary.accountRows.filter((row) => row.balance < 0).map((row) => <Link href={`/accounts/${row.id}`} className="position-row" key={`o-${row.id}`}><div><strong>{row.name}</strong><span>Negative account balance</span></div><strong className="negative">{money(Math.abs(row.balance))}</strong></Link>)}
            {summary.totalLiabilities === 0 && <div className="empty">No liabilities. Nice.</div>}
          </div>
        </div>
      </section>

      <section className="panel snapshot-panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Net worth history</h3><p className="muted">Save a snapshot periodically to build a trend over time.</p></div>{snapshotChange !== null && <div className={`snapshot-delta ${snapshotChange >= 0 ? "positive" : "negative"}`}>{snapshotChange >= 0 ? "+" : ""}{money(snapshotChange)} since previous</div>}</div>
        <form action={saveNetWorthSnapshot} className="snapshot-form">
          <div className="field"><label htmlFor="snapshot_date">Snapshot date</label><input id="snapshot_date" name="snapshot_date" type="date" defaultValue={today} required /></div>
          <div className="field"><label htmlFor="snapshot_notes">Note <span className="muted">(optional)</span></label><input id="snapshot_notes" name="notes" placeholder="e.g. September month-end" /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Save snapshot</button></div>
        </form>

        {history.length === 0 ? <div className="empty" style={{ marginTop: 14 }}>No snapshots yet. Save today&apos;s position to start your history.</div> : <>
          <div className="snapshot-bars">{[...history].reverse().slice(-12).map((row) => { const value = Number(row.net_worth); const width = Math.max((Math.abs(value) / maxMagnitude) * 100, 2); return <div className="snapshot-bar-row" key={row.id}><span>{row.snapshot_date.slice(0,7)}</span><div className="snapshot-bar-track"><div className={`snapshot-bar ${value >= 0 ? "is-positive" : "is-negative"}`} style={{ width: `${width}%` }} /></div><strong className={value >= 0 ? "positive" : "negative"}>{money(value)}</strong></div>; })}</div>
          <div className="table-wrap"><table className="modern-table"><thead><tr><th>Date</th><th>Assets</th><th>Liabilities</th><th>Net worth</th><th>Note</th><th /></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td>{row.snapshot_date}</td><td>{money(Number(row.total_assets))}</td><td>{money(Number(row.total_liabilities))}</td><td className={Number(row.net_worth) >= 0 ? "positive" : "negative"}><strong>{money(Number(row.net_worth))}</strong></td><td>{row.notes || "—"}</td><td><form action={deleteNetWorthSnapshot}><input type="hidden" name="id" value={row.id} /><button className="danger-text" type="submit">Delete</button></form></td></tr>)}</tbody></table></div>
          {totalChange !== null && <div className="snapshot-total-change"><span>Change across saved history</span><strong className={totalChange >= 0 ? "positive" : "negative"}>{totalChange >= 0 ? "+" : ""}{money(totalChange)}</strong></div>}
        </>}
      </section>
    </main>
  );
}
