import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { createAccount } from "./actions";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();

  const [{ data: accounts }, { data: transactions }, { data: savings }] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type,opening_balance,is_active").order("name"),
    supabase.from("transactions").select("transaction_type,account_id,to_account_id,amount"),
    supabase.from("savings_contributions").select("from_account_id,amount"),
  ]);

  const rows = (accounts ?? []).map(account => {
    let balance = Number(account.opening_balance);
    for (const t of transactions ?? []) {
      const amount = Number(t.amount);
      if (t.transaction_type === "income" && t.account_id === account.id) balance += amount;
      if (t.transaction_type === "expense" && t.account_id === account.id) balance -= amount;
      if (t.transaction_type === "transfer" && t.account_id === account.id) balance -= amount;
      if (t.transaction_type === "transfer" && t.to_account_id === account.id) balance += amount;
    }
    for (const s of savings ?? []) if (s.from_account_id === account.id) balance -= Number(s.amount);
    return { ...account, balance };
  });

  return (
    <main className="main">
      <div className="page-heading"><div><h2>Accounts</h2><p>Add the cash, bank and e-wallet accounts you use with MyMoney.</p></div></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="panel">
        <div className="section-heading"><div><h3>Add account</h3><p className="muted">Opening balance is the amount already in the account before you start recording transactions.</p></div></div>
        <form action={createAccount} className="form-grid compact-form">
          <div className="field"><label htmlFor="name">Account name</label><input id="name" name="name" placeholder="e.g. BDO Savings" required /></div>
          <div className="field"><label htmlFor="account_type">Type</label><select id="account_type" name="account_type" defaultValue="bank"><option value="cash">Cash</option><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="savings">Savings</option><option value="other">Other</option></select></div>
          <div className="field"><label htmlFor="opening_balance">Opening balance</label><input id="opening_balance" name="opening_balance" type="number" step="0.01" defaultValue="0" /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Add account</button></div>
        </form>
      </section>

      <section className="panel" style={{marginTop:16}}>
        <div className="section-heading"><div><h3>Your accounts</h3><p className="muted">Balances include recorded income, expenses, transfers and savings contributions.</p></div><strong>{rows.length} accounts</strong></div>
        {rows.length === 0 ? <div className="empty">No accounts yet.</div> : <div className="table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Opening balance</th><th>Current balance</th></tr></thead><tbody>{rows.map(a => <tr key={a.id}><td><strong>{a.name}</strong></td><td>{a.account_type}</td><td>{money(Number(a.opening_balance))}</td><td className={a.balance < 0 ? "negative" : "positive"}><strong>{money(a.balance)}</strong></td></tr>)}</tbody></table></div>}
      </section>
    </main>
  );
}
