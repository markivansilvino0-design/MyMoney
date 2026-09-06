import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { createSavingsGoal } from "./actions";

export default async function SavingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const { data: goals } = await supabase.from("savings_goals").select("id,name,target_amount,current_amount,target_date,status,notes").order("created_at", { ascending: true });
  const rows = goals ?? [];
  const totalSaved = rows.reduce((sum, g) => sum + Number(g.current_amount), 0);
  const totalTarget = rows.reduce((sum, g) => sum + Number(g.target_amount), 0);

  return (
    <main className="main">
      <div className="page-heading"><div><h2>Savings</h2><p>Create goals, then record contributions from the Transaction Center.</p></div><Link className="primary-btn" href="/transactions">+ Add contribution</Link></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards savings-cards">
        <div className="stat-card"><div className="stat-label">Total saved</div><div className="stat-value positive">{money(totalSaved)}</div></div>
        <div className="stat-card"><div className="stat-label">Total targets</div><div className="stat-value">{money(totalTarget)}</div></div>
      </section>

      <section className="panel" style={{marginTop:16}}>
        <div className="section-heading"><div><h3>Create savings goal</h3><p className="muted">Examples: Emergency Fund, Vacation, Tuition or New Laptop.</p></div></div>
        <form action={createSavingsGoal} className="form-grid compact-form">
          <div className="field"><label htmlFor="name">Goal name</label><input id="name" name="name" placeholder="Emergency Fund" required /></div>
          <div className="field"><label htmlFor="target_amount">Target amount</label><input id="target_amount" name="target_amount" type="number" min="0.01" step="0.01" placeholder="50000" required /></div>
          <div className="field"><label htmlFor="target_date">Target date <span className="muted">(optional)</span></label><input id="target_date" name="target_date" type="date" /></div>
          <div className="field"><label htmlFor="notes">Notes <span className="muted">(optional)</span></label><input id="notes" name="notes" placeholder="What this goal is for" /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Create goal</button></div>
        </form>
      </section>

      <section className="panel" style={{marginTop:16}}>
        <div className="section-heading"><div><h3>Your savings goals</h3><p className="muted">Progress updates automatically whenever you add, edit or delete a savings contribution.</p></div></div>
        {rows.length === 0 ? <div className="empty">No savings goals yet. Create your first goal above.</div> : <div className="goal-grid">{rows.map(g => {
          const target = Number(g.target_amount); const current = Number(g.current_amount); const pct = target > 0 ? Math.min(current / target * 100, 100) : 0;
          return <article className="goal-card" key={g.id}><div className="goal-meta"><strong>{g.name}</strong><span>{pct.toFixed(0)}%</span></div><div className="progress-track"><div className="progress-bar" style={{width:`${pct}%`}} /></div><div className="goal-amounts"><strong>{money(current)}</strong><span className="muted">of {money(target)}</span></div>{g.target_date && <div className="muted goal-date">Target: {g.target_date}</div>}{g.notes && <p className="muted">{g.notes}</p>}</article>
        })}</div>}
      </section>
    </main>
  );
}
