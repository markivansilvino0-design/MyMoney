import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { savingsGoalImpact } from "@/lib/finance";

function firstDayOfMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const monthStart = firstDayOfMonth();

  const [
    { data: monthTransactions },
    { data: recentTransactions },
    { data: goals },
    { data: monthContributions },
    { data: recentContributions },
  ] = await Promise.all([
    supabase.from("transactions").select("transaction_type,amount").gte("transaction_date", monthStart),
    supabase.from("transactions").select("id,transaction_date,transaction_type,amount,description,created_at").order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    supabase.from("savings_goals").select("id,name,target_amount,current_amount").eq("status", "active").order("created_at", { ascending: true }).limit(4),
    supabase.from("savings_contributions").select("amount,entry_type,contribution_date").gte("contribution_date", monthStart),
    supabase.from("savings_contributions").select("id,contribution_date,amount,entry_type,description,notes,created_at").order("contribution_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
  ]);

  const monthRows = monthTransactions ?? [];
  const income = monthRows.filter((transaction) => transaction.transaction_type === "income").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const expenses = monthRows.filter((transaction) => transaction.transaction_type === "expense").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const savings = (monthContributions ?? []).reduce((sum, entry) => sum + savingsGoalImpact(entry.entry_type, entry.amount), 0);
  const available = income - expenses - savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  const recent = [
    ...(recentTransactions ?? []).map((transaction) => ({ kind: "tx", id: transaction.id, date: transaction.transaction_date, type: transaction.transaction_type, entryType: "", amount: Number(transaction.amount), description: transaction.description || (transaction.transaction_type === "transfer" ? "Account transfer" : "—"), created_at: transaction.created_at })),
    ...(recentContributions ?? []).map((entry) => ({ kind: "sv", id: entry.id, date: entry.contribution_date, type: "savings", entryType: entry.entry_type ?? "deposit", amount: Number(entry.amount), description: entry.description || entry.notes || (entry.entry_type === "withdrawal" ? "Savings withdrawal" : "Savings deposit"), created_at: entry.created_at })),
  ].sort((a, b) => `${b.date} ${b.created_at}`.localeCompare(`${a.date} ${a.created_at}`)).slice(0, 8);

  return (
    <main className="main">
      <div className="page-heading"><div><h2>Dashboard</h2><p>Your current month at a glance.</p></div><Link className="primary-btn" href="/transactions">+ Add transaction</Link></div>

      <section className="cards">
        <div className="stat-card"><div className="stat-label">Income</div><div className="stat-value positive">{money(income)}</div></div>
        <div className="stat-card"><div className="stat-label">Expenses</div><div className="stat-value negative">{money(expenses)}</div></div>
        <div className="stat-card"><div className="stat-label">Net savings</div><div className={`stat-value ${savings < 0 ? "negative" : ""}`}>{money(savings)}</div></div>
        <div className="stat-card"><div className="stat-label">Available</div><div className="stat-value">{money(available)}</div></div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <h3>Income vs. expenses</h3>
          {income === 0 && expenses === 0 ? <div className="empty">No income or expense transactions yet.</div> : (
            <div style={{ display: "grid", gap: 18 }}>
              <div><div className="goal-meta"><span>Income</span><strong>{money(income)}</strong></div><div className="progress-track"><div className="progress-bar" style={{ width: "100%" }} /></div></div>
              <div><div className="goal-meta"><span>Expenses</span><strong>{money(expenses)}</strong></div><div className="progress-track"><div className="progress-bar" style={{ width: `${Math.min(income ? (expenses / income) * 100 : expenses > 0 ? 100 : 0, 100)}%` }} /></div></div>
              <div className="muted">Savings rate: <strong>{savingsRate.toFixed(1)}%</strong>{savings < 0 ? " (net withdrawal)" : ""}</div>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Savings goals</h3>
          {(goals ?? []).length === 0 ? <div className="empty">No active savings goals yet.</div> : goals!.map((goal) => {
            const target = Number(goal.target_amount);
            const current = Number(goal.current_amount);
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            return <Link href={`/savings/${goal.id}`} className="goal-row" key={goal.id}><div className="goal-meta"><strong>{goal.name}</strong><span>{pct.toFixed(0)}%</span></div><div className="progress-track"><div className="progress-bar" style={{ width: `${pct}%` }} /></div><div className="muted">{money(current)} / {money(target)}</div></Link>;
          })}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Recent transactions</h3><p className="muted">Your latest money activity.</p></div><Link className="text-btn" href="/transactions">View all</Link></div>
        {recent.length === 0 ? <div className="empty">Your recent transactions will appear here.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead><tbody>{recent.map((entry) => {
            const savingsWithdrawal = entry.type === "savings" && entry.entryType === "withdrawal";
            const positive = entry.type === "income" || savingsWithdrawal;
            const negative = entry.type === "expense" || (entry.type === "savings" && !savingsWithdrawal);
            const label = entry.type === "savings" ? (savingsWithdrawal ? "savings withdrawal" : "savings deposit") : entry.type;
            return <tr key={`${entry.kind}-${entry.id}`}><td><Link href={`/transactions/${entry.kind}/${entry.id}`}>{entry.date}</Link></td><td><Link href={`/transactions/${entry.kind}/${entry.id}`}>{entry.description}</Link></td><td><Link href={`/transactions/${entry.kind}/${entry.id}`}><span className={`type-badge type-${entry.type}`}>{label}</span></Link></td><td className={positive ? "positive amount-cell" : negative ? "negative amount-cell" : "amount-cell"}><Link href={`/transactions/${entry.kind}/${entry.id}`}>{positive ? "+" : negative ? "−" : "↔ "}{money(entry.amount)}</Link></td></tr>;
          })}</tbody></table></div>
        )}
      </section>
    </main>
  );
}
