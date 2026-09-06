import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";

function firstDayOfMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
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
    supabase.from("savings_contributions").select("amount,contribution_date").gte("contribution_date", monthStart),
    supabase.from("savings_contributions").select("id,contribution_date,amount,notes,created_at").order("contribution_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
  ]);

  const monthRows = monthTransactions ?? [];
  const income = monthRows.filter(t => t.transaction_type === "income").reduce((s,t) => s + Number(t.amount), 0);
  const expenses = monthRows.filter(t => t.transaction_type === "expense").reduce((s,t) => s + Number(t.amount), 0);
  const savings = (monthContributions ?? []).reduce((s,t) => s + Number(t.amount), 0);
  const available = income - expenses - savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  const recent = [
    ...(recentTransactions ?? []).map(t => ({ kind: "tx", id: t.id, date: t.transaction_date, type: t.transaction_type, amount: Number(t.amount), description: t.description || (t.transaction_type === "transfer" ? "Account transfer" : "—"), created_at: t.created_at })),
    ...(recentContributions ?? []).map(t => ({ kind: "sv", id: t.id, date: t.contribution_date, type: "savings", amount: Number(t.amount), description: t.notes || "Savings contribution", created_at: t.created_at })),
  ].sort((a,b) => `${b.date} ${b.created_at}`.localeCompare(`${a.date} ${a.created_at}`)).slice(0, 8);

  return (
    <main className="main">
      <div className="page-heading">
        <div><h2>Dashboard</h2><p>Your current month at a glance.</p></div>
        <Link className="primary-btn" href="/transactions">+ Add transaction</Link>
      </div>

      <section className="cards">
        <div className="stat-card"><div className="stat-label">Income</div><div className="stat-value positive">{money(income)}</div></div>
        <div className="stat-card"><div className="stat-label">Expenses</div><div className="stat-value negative">{money(expenses)}</div></div>
        <div className="stat-card"><div className="stat-label">Savings</div><div className="stat-value">{money(savings)}</div></div>
        <div className="stat-card"><div className="stat-label">Available</div><div className="stat-value">{money(available)}</div></div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <h3>Income vs. expenses</h3>
          {income === 0 && expenses === 0 ? <div className="empty">No income or expense transactions yet. Use the Transaction Center to add your first entry.</div> : (
            <div style={{display:"grid",gap:18}}>
              <div><div className="goal-meta"><span>Income</span><strong>{money(income)}</strong></div><div className="progress-track"><div className="progress-bar" style={{width:"100%"}} /></div></div>
              <div><div className="goal-meta"><span>Expenses</span><strong>{money(expenses)}</strong></div><div className="progress-track"><div className="progress-bar" style={{width:`${Math.min(income ? expenses/income*100 : expenses > 0 ? 100 : 0,100)}%`}} /></div></div>
              <div className="muted">Savings rate: <strong>{savingsRate.toFixed(1)}%</strong></div>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Savings goals</h3>
          {(goals ?? []).length === 0 ? <div className="empty">No savings goals yet. Goal creation comes in Phase 4.</div> : goals!.map(goal => {
            const target=Number(goal.target_amount); const current=Number(goal.current_amount);
            const pct=target>0?Math.min(current/target*100,100):0;
            return <div className="goal-row" key={goal.id}><div className="goal-meta"><strong>{goal.name}</strong><span>{pct.toFixed(0)}%</span></div><div className="progress-track"><div className="progress-bar" style={{width:`${pct}%`}} /></div><div className="muted">{money(current)} / {money(target)}</div></div>
          })}
        </div>
      </section>

      <section className="panel" style={{marginTop:16}}>
        <div className="section-heading"><div><h3>Recent transactions</h3><p className="muted">Your latest money activity.</p></div><Link className="text-btn" href="/transactions">View all</Link></div>
        {recent.length === 0 ? <div className="empty">Your recent transactions will appear here.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead><tbody>{recent.map(t => <tr key={`${t.kind}-${t.id}`}><td><Link href={`/transactions/${t.kind}/${t.id}`}>{t.date}</Link></td><td><Link href={`/transactions/${t.kind}/${t.id}`}>{t.description}</Link></td><td><Link href={`/transactions/${t.kind}/${t.id}`}><span className={`type-badge type-${t.type}`}>{t.type}</span></Link></td><td className={t.type === "income" ? "positive amount-cell" : t.type === "expense" || t.type === "savings" ? "negative amount-cell" : "amount-cell"}><Link href={`/transactions/${t.kind}/${t.id}`}>{t.type === "income" ? "+" : t.type === "expense" || t.type === "savings" ? "−" : "↔ "}{money(t.amount)}</Link></td></tr>)}</tbody></table></div>
        )}
      </section>
    </main>
  );
}
