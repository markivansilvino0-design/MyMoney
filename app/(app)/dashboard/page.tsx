import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";

function firstDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const monthStart = firstDayOfMonth();

  const [
    { data: monthTransactions },
    { data: recentTransactions },
    { data: goals },
    { data: contributions },
  ] = await Promise.all([
    supabase.from("transactions").select("transaction_type,amount").gte("transaction_date", monthStart),
    supabase.from("transactions").select("id,transaction_date,transaction_type,amount,description").order("transaction_date", { ascending: false }).limit(8),
    supabase.from("savings_goals").select("id,name,target_amount,current_amount").eq("status", "active").order("created_at", { ascending: true }).limit(4),
    supabase.from("savings_contributions").select("amount,contribution_date").gte("contribution_date", monthStart),
  ]);

  const monthRows = monthTransactions ?? [];
  const rows = recentTransactions ?? [];
  const income = monthRows.filter(t => t.transaction_type === "income").reduce((s,t) => s + Number(t.amount), 0);
  const expenses = monthRows.filter(t => t.transaction_type === "expense").reduce((s,t) => s + Number(t.amount), 0);
  const savings = (contributions ?? []).reduce((s,t) => s + Number(t.amount), 0);
  const available = income - expenses - savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  return (
    <main className="main">
      <div className="page-heading">
        <div><h2>Dashboard</h2><p>Your current month at a glance.</p></div>
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
          {income === 0 && expenses === 0 ? <div className="empty">No transactions yet. Phase 3 will add the transaction-entry workflow.</div> : (
            <div style={{display:"grid",gap:18}}>
              <div><div className="goal-meta"><span>Income</span><strong>{money(income)}</strong></div><div className="progress-track"><div className="progress-bar" style={{width:"100%"}} /></div></div>
              <div><div className="goal-meta"><span>Expenses</span><strong>{money(expenses)}</strong></div><div className="progress-track"><div className="progress-bar" style={{width:`${Math.min(income ? expenses/income*100 : 0,100)}%`}} /></div></div>
              <div className="muted">Savings rate: <strong>{savingsRate.toFixed(1)}%</strong></div>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Savings goals</h3>
          {(goals ?? []).length === 0 ? <div className="empty">No savings goals yet.</div> : goals!.map(goal => {
            const target=Number(goal.target_amount); const current=Number(goal.current_amount);
            const pct=target>0?Math.min(current/target*100,100):0;
            return <div className="goal-row" key={goal.id}><div className="goal-meta"><strong>{goal.name}</strong><span>{pct.toFixed(0)}%</span></div><div className="progress-track"><div className="progress-bar" style={{width:`${pct}%`}} /></div><div className="muted">{money(current)} / {money(target)}</div></div>
          })}
        </div>
      </section>

      <section className="panel" style={{marginTop:16}}>
        <h3>Recent transactions</h3>
        {rows.length === 0 ? <div className="empty">Your recent income and expense transactions will appear here.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead><tbody>{rows.map(t => <tr key={t.id}><td>{t.transaction_date}</td><td>{t.description || "—"}</td><td>{t.transaction_type}</td><td className={t.transaction_type === "income" ? "positive" : t.transaction_type === "expense" ? "negative" : ""}>{money(Number(t.amount))}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </main>
  );
}
