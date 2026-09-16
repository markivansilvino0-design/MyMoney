import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { accountBalance } from "@/lib/finance";
import { createSavingsGoal } from "./actions";

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function manilaTodayDate() {
  const value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${value}T00:00:00+08:00`);
}

function monthlyNeeded(targetDate: string | null, remaining: number) {
  if (!targetDate || remaining <= 0) return null;
  const target = new Date(`${targetDate}T00:00:00+08:00`);
  const days = Math.ceil((target.getTime() - manilaTodayDate().getTime()) / 86400000);
  if (days <= 0) return remaining;
  return remaining / Math.max(days / 30.4375, 1);
}

export default async function SavingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const [
    { data: goals },
    { data: accounts },
    { data: transactions },
    { data: savingsEntries },
    { data: cardPayments },
    { data: loans },
    { data: loanPayments },
  ] = await Promise.all([
    supabase.from("savings_goals").select("id,name,target_amount,current_amount,target_date,status,notes,goal_type,default_account_id,default_saving_mode").order("status").order("created_at", { ascending: true }),
    supabase.from("accounts").select("id,name,account_type,opening_balance,is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("transactions").select("transaction_type,account_id,to_account_id,amount"),
    supabase.from("savings_contributions").select("savings_goal_id,from_account_id,to_account_id,saving_mode,entry_type,amount"),
    supabase.from("credit_card_transactions").select("activity_type,account_id,amount").eq("activity_type", "payment"),
    supabase.from("loans").select("loan_type,funding_account_id,principal_amount,record_initial_cash"),
    supabase.from("loan_payments").select("account_id,principal_amount,interest_amount,loans(loan_type)"),
  ]);

  const rows = goals ?? [];
  const visibleRows = rows.filter((goal) => goal.status !== "archived");
  const totalSaved = visibleRows.reduce((sum, goal) => sum + Number(goal.current_amount), 0);
  const totalTarget = visibleRows.reduce((sum, goal) => sum + Number(goal.target_amount), 0);
  const activeGoals = visibleRows.filter((goal) => goal.status === "active").length;
  const sinkingFunds = visibleRows.filter((goal) => goal.goal_type === "sinking").length;
  const accountRows = accounts ?? [];
  const accountMap = new Map(accountRows.map((account) => [account.id, account.name]));
  const goalNameMap = new Map(rows.map((goal) => [goal.id, goal.name]));

  const balances = accountRows.map((account) => ({
    ...account,
    balance: accountBalance(account, transactions ?? [], savingsEntries ?? [], cardPayments ?? [], loans ?? [], loanPayments ?? []),
  }));

  const allocationMap = new Map<string, number>();
  const allocationBreakdown = new Map<string, number>();
  for (const row of savingsEntries ?? []) {
    const amount = Number(row.amount);
    const sign = row.entry_type === "withdrawal" ? -1 : 1;
    const accountId = row.saving_mode === "transfer"
      ? (row.entry_type === "withdrawal" ? row.from_account_id : row.to_account_id)
      : row.from_account_id;
    if (!accountId) continue;
    allocationMap.set(accountId, (allocationMap.get(accountId) ?? 0) + sign * amount);
    const breakdownKey = `${accountId}:${row.savings_goal_id}`;
    allocationBreakdown.set(breakdownKey, (allocationBreakdown.get(breakdownKey) ?? 0) + sign * amount);
  }

  const allocationRows = balances
    .map((account) => ({
      ...account,
      allocated: Math.max(allocationMap.get(account.id) ?? 0, 0),
      free: account.balance - Math.max(allocationMap.get(account.id) ?? 0, 0),
      allocations: rows.map((goal) => ({ id: goal.id, name: goalNameMap.get(goal.id) ?? goal.name, amount: Math.max(allocationBreakdown.get(`${account.id}:${goal.id}`) ?? 0, 0) })).filter((item) => item.amount > 0),
    }))
    .filter((account) => account.balance !== 0 || account.allocated !== 0);

  return (
    <main className="main">
      <div className="page-heading"><div><div className="eyebrow">Grow</div><h2>Savings</h2><p>Assign goals to accounts, choose earmark or transfer behavior, and plan sinking funds for future expenses.</p></div><Link className="primary-btn" href="/transactions?prefill=savings">+ Savings activity</Link></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards savings-cards">
        <div className="stat-card"><div className="stat-label">Total saved</div><div className="stat-value positive">{money(totalSaved)}</div></div>
        <div className="stat-card"><div className="stat-label">Total targets</div><div className="stat-value">{money(totalTarget)}</div></div>
        <div className="stat-card"><div className="stat-label">Remaining</div><div className="stat-value">{money(Math.max(totalTarget - totalSaved, 0))}</div></div>
        <div className="stat-card"><div className="stat-label">Active / sinking</div><div className="stat-value">{activeGoals} / {sinkingFunds}</div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Create savings goal</h3><p className="muted">Use a standard goal for general saving or a sinking fund for a known future expense.</p></div></div>
        <form action={createSavingsGoal} className="form-grid compact-form savings-goal-form">
          <div className="field"><label htmlFor="name">Goal name</label><input id="name" name="name" placeholder="Emergency Fund" required /></div>
          <div className="field"><label htmlFor="goal_type">Goal type</label><select id="goal_type" name="goal_type" defaultValue="standard"><option value="standard">Standard savings goal</option><option value="sinking">Sinking fund</option></select></div>
          <div className="field"><label htmlFor="target_amount">Target amount</label><input id="target_amount" name="target_amount" type="number" min="0.01" step="0.01" placeholder="50000" required /></div>
          <div className="field"><label htmlFor="target_date">Target date <span className="muted">(required for sinking fund)</span></label><input id="target_date" name="target_date" type="date" /></div>
          <div className="field"><label htmlFor="default_account_id">Default savings account</label><select id="default_account_id" name="default_account_id" defaultValue=""><option value="">Choose during each savings entry</option>{accountRows.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
          <div className="field"><label htmlFor="default_saving_mode">Default saving method</label><select id="default_saving_mode" name="default_saving_mode" defaultValue="earmark"><option value="earmark">Earmark in the selected account</option><option value="transfer">Transfer into the savings account</option></select></div>
          <div className="field savings-notes-field"><label htmlFor="notes">Notes <span className="muted">(optional)</span></label><input id="notes" name="notes" placeholder="What this goal is for" /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Create goal</button></div>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Your savings goals</h3><p className="muted">Default account and method are automatically suggested when you add savings.</p></div></div>
        {visibleRows.length === 0 ? <div className="empty">No savings goals yet. Create your first goal above.</div> : (
          <div className="goal-grid">
            {visibleRows.map((goal) => {
              const target = Number(goal.target_amount);
              const current = Number(goal.current_amount);
              const remaining = Math.max(target - current, 0);
              const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
              const needed = monthlyNeeded(goal.target_date, remaining);
              return (
                <Link className="goal-card goal-card-link" href={`/savings/${goal.id}`} key={goal.id}>
                  <div className="goal-meta"><strong>{goal.name}</strong><div className="goal-badges"><span className={`status-badge ${goal.goal_type === "sinking" ? "status-sinking" : "status-standard"}`}>{goal.goal_type === "sinking" ? "Sinking fund" : "Savings"}</span><span className={`status-badge status-${goal.status}`}>{statusLabel(goal.status)}</span></div></div>
                  <div className="goal-meta"><span className="muted">Progress</span><strong>{pct > 0 && pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%</strong></div>
                  <div className="progress-track"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
                  <div className="goal-amounts"><strong>{money(current)}</strong><span className="muted">of {money(target)}</span></div>
                  <div className="goal-account-line"><span className="muted">Account</span><strong>{goal.default_account_id ? accountMap.get(goal.default_account_id) ?? "Account" : "Choose per entry"}</strong></div>
                  <div className="goal-account-line"><span className="muted">Method</span><strong>{goal.default_saving_mode === "transfer" ? "Transfer" : "Earmark"}</strong></div>
                  {goal.goal_type === "sinking" && <div className="sinking-pace"><span>Monthly target</span><strong>{needed === null ? "Set a target date" : money(needed)}</strong></div>}
                  {goal.target_date && <div className="muted goal-date">Target: {goal.target_date}</div>}
                  <div className="account-card-footer">View goal →</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel allocation-panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Account allocation</h3><p className="muted">See how much of each account is already assigned to savings goals versus still unallocated.</p></div></div>
        {allocationRows.length === 0 ? <div className="empty">Account allocation will appear after you add account balances or savings activity.</div> : (
          <div className="allocation-grid">
            {allocationRows.map((account) => {
              const pct = account.balance > 0 ? Math.min((account.allocated / account.balance) * 100, 100) : 0;
              return <div className="allocation-card" key={account.id}>
                <div className="allocation-head"><div><strong>{account.name}</strong><span>{account.account_type.replace("ewallet", "E-Wallet")}</span></div><strong>{money(account.balance)}</strong></div>
                <div className="progress-track"><div className="progress-bar allocation-bar" style={{ width: `${pct}%` }} /></div>
                <div className="allocation-lines"><div><span>Allocated to goals</span><strong>{money(account.allocated)}</strong></div>{account.allocations.map((item) => <div className="allocation-goal-line" key={item.id}><span>↳ {item.name}</span><strong>{money(item.amount)}</strong></div>)}<div className="allocation-free-line"><span>Unallocated / free</span><strong className={account.free < 0 ? "negative" : "positive"}>{money(account.free)}</strong></div></div>
              </div>;
            })}
          </div>
        )}
      </section>

      {rows.some((goal) => goal.status === "archived") && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="section-heading"><div><h3>Archived goals</h3><p className="muted">Archived goals remain available for historical records.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Goal</th><th>Type</th><th>Saved</th><th>Target</th></tr></thead><tbody>{rows.filter((goal) => goal.status === "archived").map((goal) => <tr key={goal.id}><td><Link href={`/savings/${goal.id}`}>{goal.name}</Link></td><td>{goal.goal_type === "sinking" ? "Sinking fund" : "Standard"}</td><td>{money(Number(goal.current_amount))}</td><td>{money(Number(goal.target_amount))}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </main>
  );
}
