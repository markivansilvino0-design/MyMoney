import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { accountBalance } from "@/lib/finance";
import { createAccount } from "./actions";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();

  const [{ data: accounts }, { data: transactions }, { data: savings }] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type,opening_balance,is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("transactions").select("transaction_type,account_id,to_account_id,amount"),
    supabase.from("savings_contributions").select("from_account_id,to_account_id,saving_mode,amount"),
  ]);

  const transactionRows = transactions ?? [];
  const savingsRows = savings ?? [];
  const rows = (accounts ?? []).map((account) => ({
    ...account,
    balance: accountBalance(account, transactionRows, savingsRows),
  }));
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const activeCount = rows.filter((row) => row.is_active).length;

  return (
    <main className="main">
      <div className="page-heading"><div><h2>Accounts</h2><p>See where your money is held and open any account for its activity.</p></div></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards savings-cards">
        <div className="stat-card"><div className="stat-label">Total account balance</div><div className={`stat-value ${totalBalance < 0 ? "negative" : "positive"}`}>{money(totalBalance)}</div></div>
        <div className="stat-card"><div className="stat-label">Active accounts</div><div className="stat-value">{activeCount}</div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Add account</h3><p className="muted">Opening balance is the amount already in the account before your MyMoney records begin.</p></div></div>
        <form action={createAccount} className="form-grid compact-form">
          <div className="field"><label htmlFor="name">Account name</label><input id="name" name="name" placeholder="e.g. BDO Savings" required /></div>
          <div className="field"><label htmlFor="account_type">Type</label><select id="account_type" name="account_type" defaultValue="bank"><option value="cash">Cash</option><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="savings">Savings</option><option value="investment">Investment</option><option value="other">Other</option></select></div>
          <div className="field"><label htmlFor="opening_balance">Opening balance</label><input id="opening_balance" name="opening_balance" type="number" step="0.01" defaultValue="0" /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Add account</button></div>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Your accounts</h3><p className="muted">Savings set to “earmark” reserve money without changing the real account balance. Savings transfers move money between accounts.</p></div><strong>{rows.length} accounts</strong></div>
        {rows.length === 0 ? <div className="empty">No accounts yet.</div> : (
          <div className="account-grid">
            {rows.map((account) => (
              <Link className="account-card" href={`/accounts/${account.id}`} key={account.id}>
                <div className="goal-meta"><strong>{account.name}</strong><span className={`status-badge ${account.is_active ? "status-active" : "status-muted"}`}>{account.is_active ? "Active" : "Inactive"}</span></div>
                <div className="muted account-type-label">{account.account_type.replace("ewallet", "E-Wallet")}</div>
                <div className={`account-card-balance ${account.balance < 0 ? "negative" : "positive"}`}>{money(account.balance)}</div>
                <div className="muted">Opening balance: {money(Number(account.opening_balance))}</div>
                <div className="account-card-footer">View account →</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
