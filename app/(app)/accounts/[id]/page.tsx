import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { accountBalance } from "@/lib/finance";
import { deleteAccount, updateAccount } from "../actions";

function labelAccountType(type: string) {
  return type === "ewallet" ? "E-Wallet" : type.charAt(0).toUpperCase() + type.slice(1);
}

export default async function AccountDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const notices = await searchParams;
  const supabase = await createClient();

  const [{ data: account }, { data: transactions }, { data: savings }, { data: goals }, { data: cardPayments }, { data: cards }] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type,opening_balance,is_active,created_at").eq("id", id).maybeSingle(),
    supabase.from("transactions").select("id,transaction_date,transaction_type,account_id,to_account_id,amount,description,created_at").or(`account_id.eq.${id},to_account_id.eq.${id}`).order("transaction_date", { ascending: false }).limit(200),
    supabase.from("savings_contributions").select("id,contribution_date,from_account_id,to_account_id,saving_mode,entry_type,amount,description,notes,savings_goal_id,created_at").or(`from_account_id.eq.${id},to_account_id.eq.${id}`).order("contribution_date", { ascending: false }).limit(200),
    supabase.from("savings_goals").select("id,name"),
    supabase.from("credit_card_transactions").select("id,credit_card_id,activity_date,activity_type,account_id,amount,description,created_at").eq("activity_type", "payment").eq("account_id", id).order("activity_date", { ascending: false }).limit(200),
    supabase.from("credit_cards").select("id,name"),
  ]);

  if (!account) notFound();
  const txRows = transactions ?? [];
  const savingsRows = savings ?? [];
  const goalMap = new Map((goals ?? []).map((goal) => [goal.id, goal.name]));
  const cardPaymentRows = cardPayments ?? [];
  const cardMap = new Map((cards ?? []).map((card) => [card.id, card.name]));
  const balance = accountBalance(account, txRows, savingsRows, cardPaymentRows);

  let inflow = 0;
  let outflow = 0;
  let earmarked = 0;

  const activity = [
    ...txRows.map((row) => {
      const amount = Number(row.amount);
      let delta = 0;
      let description = row.description || "Transaction";
      if (row.transaction_type === "income" && row.account_id === id) delta = amount;
      if (row.transaction_type === "expense" && row.account_id === id) delta = -amount;
      if (row.transaction_type === "transfer" && row.account_id === id) { delta = -amount; description = row.description || "Transfer out"; }
      if (row.transaction_type === "transfer" && row.to_account_id === id) { delta = amount; description = row.description || "Transfer in"; }
      if (delta > 0) inflow += delta;
      if (delta < 0) outflow += Math.abs(delta);
      return { key: `tx-${row.id}`, href: `/transactions/tx/${row.id}`, date: row.transaction_date, createdAt: row.created_at, description, type: row.transaction_type, delta, amount };
    }),
    ...savingsRows.map((row) => {
      const amount = Number(row.amount);
      const goalName = goalMap.get(row.savings_goal_id) ?? "Savings goal";
      if (row.saving_mode === "earmark") {
        const signed = row.entry_type === "withdrawal" ? -amount : amount;
        if (row.from_account_id === id) earmarked += signed;
        return { key: `sv-${row.id}`, href: `/transactions/sv/${row.id}`, date: row.contribution_date, createdAt: row.created_at, description: row.description || `${row.entry_type === "withdrawal" ? "Release" : "Earmark"} · ${goalName}`, type: "savings earmark", delta: 0, amount: signed };
      }
      let delta = 0;
      if (row.from_account_id === id) delta = -amount;
      if (row.to_account_id === id) delta = amount;
      if (delta > 0) inflow += delta;
      if (delta < 0) outflow += Math.abs(delta);
      return { key: `sv-${row.id}`, href: `/transactions/sv/${row.id}`, date: row.contribution_date, createdAt: row.created_at, description: row.description || `Savings transfer · ${goalName}`, type: "savings transfer", delta, amount };
    }),
    ...cardPaymentRows.map((row) => {
      const amount = Number(row.amount);
      outflow += amount;
      const cardName = cardMap.get(row.credit_card_id) ?? "Credit card";
      return { key: `cc-${row.id}`, href: `/credit-cards/${row.credit_card_id}`, date: row.activity_date, createdAt: row.created_at, description: row.description || `Payment to ${cardName}`, type: "credit card payment", delta: -amount, amount };
    }),
  ].sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`));

  const hasHistory = activity.length > 0;

  return (
    <main className="main">
      <div className="page-heading">
        <div><Link href="/accounts" className="back-link">← Accounts</Link><h2>{account.name}</h2><p>{labelAccountType(account.account_type)} · {account.is_active ? "Active" : "Inactive"}</p></div>
        <Link className="secondary-btn" href={`/transactions?account=${account.id}`}>View in Transactions</Link>
      </div>

      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="detail-summary">
        <div className="stat-card"><div className="stat-label">Current balance</div><div className={`detail-value ${balance < 0 ? "negative" : "positive"}`}>{money(balance)}</div></div>
        <div className="stat-card"><div className="stat-label">Recorded inflow</div><div className="detail-value positive">{money(inflow)}</div></div>
        <div className="stat-card"><div className="stat-label">Recorded outflow</div><div className="detail-value negative">{money(outflow)}</div></div>
        <div className="stat-card"><div className="stat-label">Currently earmarked</div><div className="detail-value">{money(Math.max(earmarked, 0))}</div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Account activity</h3><p className="muted">Earmarks are shown here but do not change the real account balance.</p></div><strong>{activity.length} entries</strong></div>
        {activity.length === 0 ? <div className="empty">No activity yet.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Impact</th></tr></thead><tbody>{activity.map((row) => (
            <tr key={row.key}><td><Link href={row.href}>{row.date}</Link></td><td><Link href={row.href}>{row.description}</Link></td><td><Link href={row.href}>{row.type}</Link></td><td className={row.delta > 0 ? "positive amount-cell" : row.delta < 0 ? "negative amount-cell" : "amount-cell"}><Link href={row.href}>{row.delta > 0 ? "+" : row.delta < 0 ? "−" : "Reserved "}{money(Math.abs(row.delta || row.amount))}</Link></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Edit account</h3><p className="muted">Changing the opening balance recalculates the current balance immediately.</p></div></div>
        <form action={updateAccount} className="form-grid compact-form">
          <input type="hidden" name="id" value={account.id} />
          <div className="field"><label htmlFor="name">Account name</label><input id="name" name="name" defaultValue={account.name} required /></div>
          <div className="field"><label htmlFor="account_type">Type</label><select id="account_type" name="account_type" defaultValue={account.account_type}><option value="cash">Cash</option><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="savings">Savings</option><option value="investment">Investment</option><option value="other">Other</option></select></div>
          <div className="field"><label htmlFor="opening_balance">Opening balance</label><input id="opening_balance" name="opening_balance" type="number" step="0.01" defaultValue={Number(account.opening_balance)} /></div>
          <div className="field"><label htmlFor="is_active">Status</label><select id="is_active" name="is_active" defaultValue={account.is_active ? "true" : "false"}><option value="true">Active</option><option value="false">Inactive</option></select></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Save account</button></div>
        </form>
      </section>

      <section className="danger-zone">
        <div><strong>Delete account</strong><p>{hasHistory ? "This account has history, so MyMoney will require you to mark it Inactive instead." : "This account has no recorded history and can be deleted."}</p></div>
        <form action={deleteAccount}><input type="hidden" name="id" value={account.id} /><button className="danger-btn" type="submit" disabled={hasHistory}>Delete</button></form>
      </section>
    </main>
  );
}
