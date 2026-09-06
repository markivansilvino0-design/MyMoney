import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { createSavingsGoal } from "./actions";

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function SavingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const { data: goals } = await supabase.from("savings_goals").select("id,name,target_amount,current_amount,target_date,status,notes").order("status").order("created_at", { ascending: true });
  const rows = goals ?? [];
  const visibleRows = rows.filter((goal) => goal.status !== "archived");
  const totalSaved = visibleRows.reduce((sum, goal) => sum + Number(goal.current_amount), 0);
  const totalTarget = visibleRows.reduce((sum, goal) => sum + Number(goal.target_amount), 0);
  const activeGoals = visibleRows.filter((goal) => goal.status === "active").length;

  return (
    <main className="main">
      <div className="page-heading"><div><div className="eyebrow">Grow</div><h2>Savings</h2><p>Set goals, reserve money, or physically transfer it into a savings account.</p></div><Link className="primary-btn" href="/transactions?prefill=savings">+ Savings activity</Link></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards">
        <div className="stat-card"><div className="stat-label">Total saved</div><div className="stat-value positive">{money(totalSaved)}</div></div>
        <div className="stat-card"><div className="stat-label">Total targets</div><div className="stat-value">{money(totalTarget)}</div></div>
        <div className="stat-card"><div className="stat-label">Remaining</div><div className="stat-value">{money(Math.max(totalTarget - totalSaved, 0))}</div></div>
        <div className="stat-card"><div className="stat-label">Active goals</div><div className="stat-value">{activeGoals}</div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Create savings goal</h3><p className="muted">Examples: Emergency Fund, Vacation, Tuition or New Laptop.</p></div></div>
        <form action={createSavingsGoal} className="form-grid compact-form">
          <div className="field"><label htmlFor="name">Goal name</label><input id="name" name="name" placeholder="Emergency Fund" required /></div>
          <div className="field"><label htmlFor="target_amount">Target amount</label><input id="target_amount" name="target_amount" type="number" min="0.01" step="0.01" placeholder="50000" required /></div>
          <div className="field"><label htmlFor="target_date">Target date <span className="muted">(optional)</span></label><input id="target_date" name="target_date" type="date" /></div>
          <div className="field"><label htmlFor="notes">Notes <span className="muted">(optional)</span></label><input id="notes" name="notes" placeholder="What this goal is for" /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Create goal</button></div>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Your savings goals</h3><p className="muted">Click a goal for contribution history, withdrawal options, required saving pace and editing.</p></div></div>
        {visibleRows.length === 0 ? <div className="empty">No savings goals yet. Create your first goal above.</div> : (
          <div className="goal-grid">
            {visibleRows.map((goal) => {
              const target = Number(goal.target_amount);
              const current = Number(goal.current_amount);
              const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
              return (
                <Link className="goal-card goal-card-link" href={`/savings/${goal.id}`} key={goal.id}>
                  <div className="goal-meta"><strong>{goal.name}</strong><span className={`status-badge status-${goal.status}`}>{statusLabel(goal.status)}</span></div>
                  <div className="goal-meta"><span className="muted">Progress</span><strong>{pct > 0 && pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%</strong></div>
                  <div className="progress-track"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
                  <div className="goal-amounts"><strong>{money(current)}</strong><span className="muted">of {money(target)}</span></div>
                  <div className="muted">Remaining: {money(Math.max(target - current, 0))}</div>
                  {goal.target_date && <div className="muted goal-date">Target: {goal.target_date}</div>}
                  <div className="account-card-footer">View goal →</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {rows.some((goal) => goal.status === "archived") && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="section-heading"><div><h3>Archived goals</h3><p className="muted">Archived goals remain available for historical records.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Goal</th><th>Saved</th><th>Target</th></tr></thead><tbody>{rows.filter((goal) => goal.status === "archived").map((goal) => <tr key={goal.id}><td><Link href={`/savings/${goal.id}`}>{goal.name}</Link></td><td>{money(Number(goal.current_amount))}</td><td>{money(Number(goal.target_amount))}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </main>
  );
}
