import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { archiveSavingsGoal, deleteSavingsGoal, updateSavingsGoal } from "../actions";

function manilaTodayDate() {
  const value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${value}T00:00:00+08:00`);
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00+08:00`);
  return Math.ceil((target.getTime() - manilaTodayDate().getTime()) / 86400000);
}

export default async function SavingsGoalDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const notices = await searchParams;
  const supabase = await createClient();

  const [{ data: goal }, { data: contributions }, { data: accounts }] = await Promise.all([
    supabase.from("savings_goals").select("id,name,target_amount,current_amount,target_date,status,notes,created_at").eq("id", id).maybeSingle(),
    supabase.from("savings_contributions").select("id,contribution_date,entry_type,saving_mode,from_account_id,to_account_id,amount,description,notes,created_at").eq("savings_goal_id", id).order("contribution_date", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    supabase.from("accounts").select("id,name"),
  ]);

  if (!goal) notFound();
  const rows = contributions ?? [];
  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account.name]));
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const remaining = Math.max(target - current, 0);
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const days = daysUntil(goal.target_date);
  const weeks = days && days > 0 ? Math.max(days / 7, 1) : null;
  const months = days && days > 0 ? Math.max(days / 30.4375, 1) : null;
  const weeklyRequired = weeks ? remaining / weeks : null;
  const monthlyRequired = months ? remaining / months : null;
  const deposits = rows.filter((row) => row.entry_type !== "withdrawal").reduce((sum, row) => sum + Number(row.amount), 0);
  const withdrawals = rows.filter((row) => row.entry_type === "withdrawal").reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <main className="main">
      <div className="page-heading">
        <div><Link href="/savings" className="back-link">← Savings</Link><h2>{goal.name}</h2><p>{goal.status.charAt(0).toUpperCase() + goal.status.slice(1)} goal</p></div>
        {goal.status === "active" && <div className="heading-actions"><Link className="secondary-btn" href={`/transactions?prefill=savings&goal=${goal.id}&savings_action=withdrawal`}>Withdraw</Link><Link className="primary-btn" href={`/transactions?prefill=savings&goal=${goal.id}`}>+ Add savings</Link></div>}
      </div>

      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="detail-summary">
        <div className="stat-card"><div className="stat-label">Saved</div><div className="detail-value positive">{money(current)}</div></div>
        <div className="stat-card"><div className="stat-label">Remaining</div><div className="detail-value">{money(remaining)}</div></div>
        <div className="stat-card"><div className="stat-label">Progress</div><div className="detail-value">{pct.toFixed(1)}%</div></div>
        <div className="stat-card"><div className="stat-label">Target date</div><div className="detail-value">{goal.target_date ?? "No date"}</div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="goal-meta"><strong>{money(current)} of {money(target)}</strong><span>{pct > 0 && pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%</span></div>
        <div className="progress-track" style={{ marginTop: 10 }}><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
        <div className="goal-metrics">
          <div><span className="muted">Deposits</span><strong>{money(deposits)}</strong></div>
          <div><span className="muted">Withdrawals</span><strong>{money(withdrawals)}</strong></div>
          <div><span className="muted">Days remaining</span><strong>{days === null ? "—" : Math.max(days, 0)}</strong></div>
          <div><span className="muted">Weekly needed</span><strong>{weeklyRequired === null ? "—" : money(weeklyRequired)}</strong></div>
          <div><span className="muted">Monthly needed</span><strong>{monthlyRequired === null ? "—" : money(monthlyRequired)}</strong></div>
        </div>
        {goal.notes && <p className="muted" style={{ marginBottom: 0 }}>{goal.notes}</p>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Savings history</h3><p className="muted">Deposits increase the goal; withdrawals reduce it. Earmarks do not move the real account balance.</p></div><strong>{rows.length} entries</strong></div>
        {rows.length === 0 ? <div className="empty">No savings activity yet.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Action</th><th>Mode</th><th>Account movement</th><th>Amount</th></tr></thead><tbody>{rows.map((row) => {
            const from = accountMap.get(row.from_account_id ?? "") ?? "—";
            const to = accountMap.get(row.to_account_id ?? "") ?? "—";
            const movement = row.saving_mode === "transfer" ? `${from} → ${to}` : `Earmarked in ${from}`;
            const withdrawal = row.entry_type === "withdrawal";
            return <tr key={row.id}><td><Link href={`/transactions/sv/${row.id}`}>{row.contribution_date}</Link></td><td><Link href={`/transactions/sv/${row.id}`}>{row.description || row.notes || (withdrawal ? "Savings withdrawal" : "Savings deposit")}</Link></td><td><Link href={`/transactions/sv/${row.id}`}>{withdrawal ? "Withdrawal" : "Deposit"}</Link></td><td><Link href={`/transactions/sv/${row.id}`}>{row.saving_mode === "transfer" ? "Account transfer" : "Earmark"}</Link></td><td><Link href={`/transactions/sv/${row.id}`}>{movement}</Link></td><td className={withdrawal ? "positive amount-cell" : "negative amount-cell"}><Link href={`/transactions/sv/${row.id}`}>{withdrawal ? "+" : "−"}{money(Number(row.amount))}</Link></td></tr>;
          })}</tbody></table></div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Edit goal</h3><p className="muted">Paused goals stay visible but are not offered for new contributions. Archived goals move out of the main list.</p></div></div>
        <form action={updateSavingsGoal} className="form-grid compact-form">
          <input type="hidden" name="id" value={goal.id} />
          <div className="field"><label htmlFor="name">Goal name</label><input id="name" name="name" defaultValue={goal.name} required /></div>
          <div className="field"><label htmlFor="target_amount">Target amount</label><input id="target_amount" name="target_amount" type="number" min="0.01" step="0.01" defaultValue={target} required /></div>
          <div className="field"><label htmlFor="target_date">Target date</label><input id="target_date" name="target_date" type="date" defaultValue={goal.target_date ?? ""} /></div>
          <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={goal.status}><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div>
          <div className="field"><label htmlFor="notes">Notes</label><input id="notes" name="notes" defaultValue={goal.notes ?? ""} /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Save goal</button></div>
        </form>
      </section>

      <section className="danger-zone">
        <div><strong>Archive or delete goal</strong><p>{rows.length > 0 ? "This goal has savings history, so archive it to preserve your records." : "This unused goal can be archived or permanently deleted."}</p></div>
        <div className="danger-actions">
          {goal.status !== "archived" && <form action={archiveSavingsGoal}><input type="hidden" name="id" value={goal.id} /><button className="secondary-btn" type="submit">Archive</button></form>}
          <form action={deleteSavingsGoal}><input type="hidden" name="id" value={goal.id} /><button className="danger-btn" type="submit" disabled={rows.length > 0}>Delete</button></form>
        </div>
      </section>
    </main>
  );
}
