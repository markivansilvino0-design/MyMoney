import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { TransactionForm } from "@/components/transaction-form";

type SearchParams = Promise<{
  error?: string;
  success?: string;
  from?: string;
  to?: string;
  type?: string;
  account?: string;
  category?: string;
  owner?: string;
  q?: string;
}>;

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function typeLabel(type: string) {
  return type === "income" ? "Income" : type === "expense" ? "Expense" : type === "transfer" ? "Transfer" : "Savings";
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: accounts }, { data: categories }, { data: owners }, { data: goals }] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type").eq("is_active", true).order("name"),
    supabase.from("categories").select("id,name,category_type").eq("is_active", true).order("category_type").order("name"),
    supabase.from("owners").select("id,name,is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    supabase.from("savings_goals").select("id,name,target_amount,current_amount").eq("status", "active").order("name"),
  ]);

  const accountRows = accounts ?? [];
  const categoryRows = (categories ?? []) as { id: string; name: string; category_type: "income" | "expense" }[];
  const ownerRows = owners ?? [];
  const goalRows = goals ?? [];

  let txQuery = supabase.from("transactions").select("id,transaction_date,transaction_type,account_id,to_account_id,category_id,owner_id,amount,description,need_want,fixed_variable,created_at").order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  let svQuery = supabase.from("savings_contributions").select("id,contribution_date,from_account_id,savings_goal_id,amount,notes,created_at").order("contribution_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);

  if (params.from) { txQuery = txQuery.gte("transaction_date", params.from); svQuery = svQuery.gte("contribution_date", params.from); }
  if (params.to) { txQuery = txQuery.lte("transaction_date", params.to); svQuery = svQuery.lte("contribution_date", params.to); }
  if (params.account) { txQuery = txQuery.or(`account_id.eq.${params.account},to_account_id.eq.${params.account}`); svQuery = svQuery.eq("from_account_id", params.account); }
  if (params.category) txQuery = txQuery.eq("category_id", params.category);
  if (params.owner) txQuery = txQuery.eq("owner_id", params.owner);
  if (params.type && params.type !== "all" && params.type !== "savings") txQuery = txQuery.eq("transaction_type", params.type);

  const includeTransactions = params.type !== "savings";
  const includeSavings = (!params.type || params.type === "all" || params.type === "savings") && !params.category && !params.owner;
  const [{ data: txData }, { data: svData }] = await Promise.all([
    includeTransactions ? txQuery : Promise.resolve({ data: [] as never[] }),
    includeSavings ? svQuery : Promise.resolve({ data: [] as never[] }),
  ]);

  const accountMap = new Map(accountRows.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));
  const ownerMap = new Map(ownerRows.map((o) => [o.id, o.name]));
  const goalMap = new Map(goalRows.map((g) => [g.id, g.name]));

  const combined = [
    ...(txData ?? []).map((row) => ({
      kind: "tx" as const,
      id: row.id,
      date: row.transaction_date,
      type: row.transaction_type,
      amount: Number(row.amount),
      description: row.description || (row.transaction_type === "transfer" ? "Account transfer" : "—"),
      category: row.category_id ? categoryMap.get(row.category_id) ?? "—" : "—",
      owner: row.owner_id ? ownerMap.get(row.owner_id) ?? "—" : "—",
      account: row.transaction_type === "transfer"
        ? `${accountMap.get(row.account_id ?? "") ?? "—"} → ${accountMap.get(row.to_account_id ?? "") ?? "—"}`
        : accountMap.get(row.account_id ?? "") ?? "—",
      created_at: row.created_at,
    })),
    ...(svData ?? []).map((row) => ({
      kind: "sv" as const,
      id: row.id,
      date: row.contribution_date,
      type: "savings",
      amount: Number(row.amount),
      description: row.notes || "Savings contribution",
      category: goalMap.get(row.savings_goal_id) ?? "Savings goal",
      owner: "—",
      account: `${accountMap.get(row.from_account_id ?? "") ?? "—"} → ${goalMap.get(row.savings_goal_id) ?? "Savings"}`,
      created_at: row.created_at,
    })),
  ]
    .filter((row) => {
      const q = params.q?.trim().toLowerCase();
      if (!q) return true;
      return [row.description, row.category, row.owner, row.account, row.type].some((value) => value.toLowerCase().includes(q));
    })
    .sort((a, b) => `${b.date} ${b.created_at}`.localeCompare(`${a.date} ${a.created_at}`));

  return (
    <main className="main">
      <div className="page-heading">
        <div><h2>Transactions</h2><p>Record income, expenses, transfers and savings in one place.</p></div>
      </div>

      {params.error && <div className="notice error page-notice">{params.error}</div>}
      {params.success && <div className="notice success page-notice">{params.success}</div>}

      <section className="panel transaction-entry-panel">
        <div className="section-heading"><div><h3>Add transaction</h3><p className="muted">Choose a type and MyMoney will show only the fields you need.</p></div></div>
        <TransactionForm accounts={accountRows} categories={categoryRows} owners={ownerRows} goals={goalRows.map(g => ({ ...g, target_amount: Number(g.target_amount), current_amount: Number(g.current_amount) }))} today={manilaToday()} />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Transaction history</h3><p className="muted">Click any transaction to view or edit it.</p></div><strong>{combined.length} shown</strong></div>

        <form method="get" className="filter-grid">
          <div className="field"><label>From</label><input type="date" name="from" defaultValue={params.from ?? ""} /></div>
          <div className="field"><label>To</label><input type="date" name="to" defaultValue={params.to ?? ""} /></div>
          <div className="field"><label>Type</label><select name="type" defaultValue={params.type ?? "all"}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option><option value="savings">Savings</option></select></div>
          <div className="field"><label>Account</label><select name="account" defaultValue={params.account ?? ""}><option value="">All accounts</option>{accountRows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label>Category</label><select name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{categoryRows.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Owner</label><select name="owner" defaultValue={params.owner ?? ""}><option value="">All owners</option>{ownerRows.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <div className="field filter-search"><label>Search</label><input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Description, category..." /></div>
          <div className="filter-actions"><button className="secondary-btn" type="submit">Apply filters</button><Link className="text-btn" href="/transactions">Clear</Link></div>
        </form>

        {combined.length === 0 ? <div className="empty">No transactions match your filters.</div> : (
          <div className="table-wrap"><table className="transaction-table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Category / Goal</th><th>Account</th><th>Owner</th><th>Amount</th></tr></thead><tbody>
            {combined.map((row) => <tr key={`${row.kind}-${row.id}`} className="clickable-row">
              <td><Link href={`/transactions/${row.kind}/${row.id}`}>{row.date}</Link></td>
              <td><Link href={`/transactions/${row.kind}/${row.id}`}>{row.description}</Link></td>
              <td><Link href={`/transactions/${row.kind}/${row.id}`}><span className={`type-badge type-${row.type}`}>{typeLabel(row.type)}</span></Link></td>
              <td><Link href={`/transactions/${row.kind}/${row.id}`}>{row.category}</Link></td>
              <td><Link href={`/transactions/${row.kind}/${row.id}`}>{row.account}</Link></td>
              <td><Link href={`/transactions/${row.kind}/${row.id}`}>{row.owner}</Link></td>
              <td className={row.type === "income" ? "positive amount-cell" : row.type === "expense" || row.type === "savings" ? "negative amount-cell" : "amount-cell"}><Link href={`/transactions/${row.kind}/${row.id}`}>{row.type === "income" ? "+" : row.type === "expense" || row.type === "savings" ? "−" : "↔ "}{money(row.amount)}</Link></td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>
    </main>
  );
}
