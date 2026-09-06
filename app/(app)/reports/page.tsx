import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { savingsGoalImpact } from "@/lib/finance";

type Params = Promise<{ from?: string; to?: string; account?: string; category?: string; owner?: string }>;

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function firstDay(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function validDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function percentLabel(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.abs(value) < 10 && value !== 0 ? value.toFixed(1) : value.toFixed(0)}%`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const today = manilaToday();
  const from = validDate(params.from) ? params.from! : firstDay(today);
  const to = validDate(params.to) ? params.to! : today;
  const supabase = await createClient();

  const [{ data: categories }, { data: owners }, { data: accounts }] = await Promise.all([
    supabase.from("categories").select("id,name,category_type").eq("is_active", true).order("name"),
    supabase.from("owners").select("id,name").eq("is_active", true).order("name"),
    supabase.from("accounts").select("id,name").order("name"),
  ]);

  let txQuery = supabase
    .from("transactions")
    .select("transaction_date,transaction_type,account_id,to_account_id,category_id,owner_id,amount,need_want,fixed_variable")
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date");
  let svQuery = supabase
    .from("savings_contributions")
    .select("contribution_date,from_account_id,to_account_id,entry_type,amount")
    .gte("contribution_date", from)
    .lte("contribution_date", to)
    .order("contribution_date");

  if (params.account) {
    txQuery = txQuery.or(`account_id.eq.${params.account},to_account_id.eq.${params.account}`);
    svQuery = svQuery.or(`from_account_id.eq.${params.account},to_account_id.eq.${params.account}`);
  }
  if (params.category) txQuery = txQuery.eq("category_id", params.category);
  if (params.owner) txQuery = txQuery.eq("owner_id", params.owner);

  const includeSavings = !params.category && !params.owner;
  const [{ data: transactions }, { data: savings }] = await Promise.all([
    txQuery,
    includeSavings ? svQuery : Promise.resolve({ data: [] as never[] }),
  ]);

  const txRows = transactions ?? [];
  const svRows = savings ?? [];
  const categoryMap = new Map((categories ?? []).map((row) => [row.id, row.name]));
  const ownerMap = new Map((owners ?? []).map((row) => [row.id, row.name]));

  const income = txRows.filter((row) => row.transaction_type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = txRows.filter((row) => row.transaction_type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const netSavings = svRows.reduce((sum, row) => sum + savingsGoalImpact(row.entry_type, row.amount), 0);
  const freeCashFlow = income - expenses - netSavings;
  const savingsRate = income > 0 ? (netSavings / income) * 100 : 0;

  const byCategory = new Map<string, number>();
  const byOwner = new Map<string, number>();
  const byNeedWant = new Map<string, number>();
  const byFixedVariable = new Map<string, number>();
  const monthly = new Map<string, { income: number; expense: number; savings: number }>();

  for (const row of txRows) {
    const amount = Number(row.amount);
    const month = row.transaction_date.slice(0, 7);
    const bucket = monthly.get(month) ?? { income: 0, expense: 0, savings: 0 };
    if (row.transaction_type === "income") bucket.income += amount;
    if (row.transaction_type === "expense") {
      bucket.expense += amount;
      const category = row.category_id ? categoryMap.get(row.category_id) ?? "Uncategorized" : "Uncategorized";
      byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
      const owner = row.owner_id ? ownerMap.get(row.owner_id) ?? "No owner" : "No owner";
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + amount);
      const nw = row.need_want === "want" ? "Wants" : row.need_want === "need" ? "Needs" : "Unclassified";
      byNeedWant.set(nw, (byNeedWant.get(nw) ?? 0) + amount);
      const fv = row.fixed_variable === "fixed" ? "Fixed" : row.fixed_variable === "variable" ? "Variable" : "Unclassified";
      byFixedVariable.set(fv, (byFixedVariable.get(fv) ?? 0) + amount);
    }
    monthly.set(month, bucket);
  }

  for (const row of svRows) {
    const month = row.contribution_date.slice(0, 7);
    const bucket = monthly.get(month) ?? { income: 0, expense: 0, savings: 0 };
    bucket.savings += savingsGoalImpact(row.entry_type, row.amount);
    monthly.set(month, bucket);
  }

  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const ownerRows = [...byOwner.entries()].sort((a, b) => b[1] - a[1]);
  const needWantRows = [...byNeedWant.entries()].sort((a, b) => b[1] - a[1]);
  const fixedRows = [...byFixedVariable.entries()].sort((a, b) => b[1] - a[1]);
  const monthRows = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxCategory = Math.max(...categoryRows.map(([, value]) => value), 1);
  const maxOwner = Math.max(...ownerRows.map(([, value]) => value), 1);
  const maxMonth = Math.max(...monthRows.flatMap(([, value]) => [value.income, value.expense, Math.max(value.savings, 0)]), 1);

  return (
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">Analyze</div><h2>Reports</h2><p>Understand where your money came from, where it went, and how much you kept.</p></div>
      </div>

      <section className="panel report-filter-panel">
        <form className="report-filter-grid" method="get">
          <div className="field"><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} /></div>
          <div className="field"><label htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} /></div>
          <div className="field"><label htmlFor="account">Account</label><select id="account" name="account" defaultValue={params.account ?? ""}><option value="">All accounts</option>{(accounts ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{(categories ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <div className="field"><label htmlFor="owner">Owner</label><select id="owner" name="owner" defaultValue={params.owner ?? ""}><option value="">All owners</option>{(owners ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Apply report</button><a className="text-btn" href="/reports">Reset</a></div>
        </form>
      </section>

      <section className="cards report-stats">
        <div className="stat-card"><div className="stat-label">Income</div><div className="stat-value positive">{money(income)}</div><div className="stat-foot">Money received</div></div>
        <div className="stat-card"><div className="stat-label">Expenses</div><div className="stat-value negative">{money(expenses)}</div><div className="stat-foot">Money spent</div></div>
        <div className="stat-card"><div className="stat-label">Net savings</div><div className={`stat-value ${netSavings < 0 ? "negative" : "positive"}`}>{money(netSavings)}</div><div className="stat-foot">Savings rate {percentLabel(savingsRate)}</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Available cash flow</div><div className={`stat-value ${freeCashFlow < 0 ? "negative" : ""}`}>{money(freeCashFlow)}</div><div className="stat-foot">Income − expenses − savings</div></div>
      </section>

      <section className="report-grid">
        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Monthly trend</h3><p className="muted">Income, expenses and savings over the selected period.</p></div></div>
          {monthRows.length === 0 ? <div className="empty">No activity in this period.</div> : <div className="trend-chart">{monthRows.map(([month, values]) => <div className="trend-column" key={month}><div className="trend-bars"><div className="trend-bar income-bar" style={{ height: `${Math.max((values.income / maxMonth) * 100, values.income ? 6 : 0)}%` }} title={`Income ${money(values.income)}`} /><div className="trend-bar expense-bar" style={{ height: `${Math.max((values.expense / maxMonth) * 100, values.expense ? 6 : 0)}%` }} title={`Expenses ${money(values.expense)}`} /><div className="trend-bar savings-bar" style={{ height: `${Math.max((Math.max(values.savings, 0) / maxMonth) * 100, values.savings > 0 ? 6 : 0)}%` }} title={`Savings ${money(values.savings)}`} /></div><span>{month}</span></div>)}</div>}
          <div className="chart-legend"><span><i className="legend-dot income-dot" />Income</span><span><i className="legend-dot expense-dot" />Expenses</span><span><i className="legend-dot savings-dot" />Savings</span></div>
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Expense categories</h3><p className="muted">Your biggest spending areas.</p></div></div>
          {categoryRows.length === 0 ? <div className="empty compact-empty">No expense data.</div> : <div className="bar-list">{categoryRows.slice(0, 8).map(([label, value]) => <div className="bar-list-row" key={label}><div className="bar-list-meta"><span>{label}</span><strong>{money(value)}</strong></div><div className="mini-track"><div className="mini-bar" style={{ width: `${(value / maxCategory) * 100}%` }} /></div></div>)}</div>}
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Need vs. want</h3><p className="muted">How intentional your expense mix is.</p></div></div>
          {needWantRows.length === 0 ? <div className="empty compact-empty">No classified expenses.</div> : <div className="split-metrics">{needWantRows.map(([label, value]) => <div className="split-metric" key={label}><span>{label}</span><strong>{money(value)}</strong><small>{expenses > 0 ? percentLabel((value / expenses) * 100) : "0%"}</small></div>)}</div>}
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Fixed vs. variable</h3><p className="muted">Your recurring and flexible spending.</p></div></div>
          {fixedRows.length === 0 ? <div className="empty compact-empty">No classified expenses.</div> : <div className="split-metrics">{fixedRows.map(([label, value]) => <div className="split-metric" key={label}><span>{label}</span><strong>{money(value)}</strong><small>{expenses > 0 ? percentLabel((value / expenses) * 100) : "0%"}</small></div>)}</div>}
        </div>

        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Expense by owner</h3><p className="muted">See who each expense was charged to.</p></div></div>
          {ownerRows.length === 0 ? <div className="empty compact-empty">No owner-based expenses.</div> : <div className="owner-grid">{ownerRows.map(([label, value]) => <div className="owner-card" key={label}><div><strong>{label}</strong><span className="muted">{expenses > 0 ? percentLabel((value / expenses) * 100) : "0%"} of expenses</span></div><strong>{money(value)}</strong><div className="mini-track"><div className="mini-bar" style={{ width: `${(value / maxOwner) * 100}%` }} /></div></div>)}</div>}
        </div>
      </section>
    </main>
  );
}
