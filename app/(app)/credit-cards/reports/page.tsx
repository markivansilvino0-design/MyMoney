import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import {
  availableCredit,
  creditCardBalance,
  creditCardImpact,
  defaultStatementMonth,
  statementPeriodForMonth,
  utilizationRate,
} from "@/lib/credit-cards";

type Params = Promise<{
  from?: string;
  to?: string;
  card?: string;
  owner?: string;
  category?: string;
  type?: string;
}>;

type ActivityRow = {
  id: string;
  credit_card_id: string;
  activity_date: string;
  activity_type: string;
  account_id: string | null;
  category_id: string | null;
  owner_id: string | null;
  amount: number | string;
  description: string | null;
  need_want: string | null;
  fixed_variable: string | null;
  installment_id: string | null;
  installment_sequence: number | null;
  installment_total: number | null;
};

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function firstDay(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function validDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value > 0 && value < 10 ? value.toFixed(1) : value.toFixed(0)}%`;
}

function activityLabel(type: string) {
  if (type === "purchase") return "Purchase";
  if (type === "payment") return "Payment";
  if (type === "refund") return "Refund";
  if (type === "fee") return "Fee";
  if (type === "interest") return "Interest";
  return type;
}

function expenseImpact(type: string, amount: number | string) {
  const value = Number(amount);
  if (type === "refund") return -value;
  if (["purchase", "fee", "interest"].includes(type)) return value;
  return 0;
}

export default async function CreditCardReportsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const today = manilaToday();
  const from = validDate(params.from) ? params.from! : firstDay(today);
  const to = validDate(params.to) ? params.to! : today;
  const supabase = await createClient();

  const [{ data: cards }, { data: categories }, { data: owners }, { data: accounts }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id,name,issuer,last4,credit_limit,opening_balance,statement_day,due_days_after_statement,is_active")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.from("categories").select("id,name,category_type").order("name"),
    supabase.from("owners").select("id,name").order("name"),
    supabase.from("accounts").select("id,name").order("name"),
  ]);

  let rangeQuery = supabase
    .from("credit_card_transactions")
    .select("id,credit_card_id,activity_date,activity_type,account_id,category_id,owner_id,amount,description,need_want,fixed_variable,installment_id,installment_sequence,installment_total")
    .gte("activity_date", from)
    .lte("activity_date", to)
    .order("activity_date", { ascending: false });

  let asOfQuery = supabase
    .from("credit_card_transactions")
    .select("credit_card_id,activity_type,activity_date,amount")
    .lte("activity_date", to)
    .order("activity_date");

  let futureInstallmentQuery = supabase
    .from("credit_card_transactions")
    .select("id,credit_card_id,activity_date,amount,description,installment_id,installment_sequence,installment_total")
    .gt("activity_date", to)
    .not("installment_id", "is", null)
    .order("activity_date")
    .limit(120);

  if (params.card) {
    rangeQuery = rangeQuery.eq("credit_card_id", params.card);
    asOfQuery = asOfQuery.eq("credit_card_id", params.card);
    futureInstallmentQuery = futureInstallmentQuery.eq("credit_card_id", params.card);
  }
  if (params.owner) rangeQuery = rangeQuery.eq("owner_id", params.owner);
  if (params.category) rangeQuery = rangeQuery.eq("category_id", params.category);
  if (params.type && ["purchase", "payment", "refund", "fee", "interest"].includes(params.type)) {
    rangeQuery = rangeQuery.eq("activity_type", params.type);
  }

  const [{ data: rangeActivity }, { data: asOfActivity }, { data: futureInstallments }] = await Promise.all([
    rangeQuery,
    asOfQuery,
    futureInstallmentQuery,
  ]);

  const cardRows = cards ?? [];
  const selectedCards = params.card ? cardRows.filter((card) => card.id === params.card) : cardRows;
  const activityRows = (rangeActivity ?? []) as ActivityRow[];
  const asOfRows = asOfActivity ?? [];
  const futureRows = futureInstallments ?? [];

  const cardMap = new Map(cardRows.map((row) => [row.id, row]));
  const categoryMap = new Map((categories ?? []).map((row) => [row.id, row.name]));
  const ownerMap = new Map((owners ?? []).map((row) => [row.id, row.name]));
  const accountMap = new Map((accounts ?? []).map((row) => [row.id, row.name]));

  const purchases = activityRows.filter((row) => row.activity_type === "purchase").reduce((sum, row) => sum + Number(row.amount), 0);
  const payments = activityRows.filter((row) => row.activity_type === "payment").reduce((sum, row) => sum + Number(row.amount), 0);
  const refunds = activityRows.filter((row) => row.activity_type === "refund").reduce((sum, row) => sum + Number(row.amount), 0);
  const fees = activityRows.filter((row) => row.activity_type === "fee").reduce((sum, row) => sum + Number(row.amount), 0);
  const interest = activityRows.filter((row) => row.activity_type === "interest").reduce((sum, row) => sum + Number(row.amount), 0);
  const netCardSpend = purchases + fees + interest - refunds;
  const netBalanceChange = netCardSpend - payments;
  const scheduledFuture = futureRows.reduce((sum, row) => sum + Number(row.amount), 0);

  const cardSummaries = selectedCards.map((card) => {
    const balanceRows = asOfRows.filter((row) => row.credit_card_id === card.id);
    const balance = creditCardBalance(card, balanceRows, to);
    const available = availableCredit(card, balance);
    const utilization = utilizationRate(card, balance);
    const periodRows = activityRows.filter((row) => row.credit_card_id === card.id);
    const spend = periodRows.reduce((sum, row) => sum + expenseImpact(row.activity_type, row.amount), 0);
    const paid = periodRows.filter((row) => row.activity_type === "payment").reduce((sum, row) => sum + Number(row.amount), 0);
    const feesAndInterest = periodRows
      .filter((row) => row.activity_type === "fee" || row.activity_type === "interest")
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const statementMonth = defaultStatementMonth(to, Number(card.statement_day), Number(card.due_days_after_statement));
    const cycle = statementPeriodForMonth(statementMonth, Number(card.statement_day), Number(card.due_days_after_statement));
    return { ...card, balance, available, utilization, spend, paid, feesAndInterest, cycle };
  });

  const totalOutstanding = cardSummaries.reduce((sum, card) => sum + Math.max(card.balance, 0), 0);
  const totalLimit = cardSummaries.reduce((sum, card) => sum + Number(card.credit_limit), 0);
  const totalAvailable = cardSummaries.reduce((sum, card) => sum + card.available, 0);
  const utilization = totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0;

  const byCard = new Map<string, { spend: number; payments: number }>();
  const byCategory = new Map<string, number>();
  const byOwner = new Map<string, number>();
  const byPaymentAccount = new Map<string, number>();
  const byNeedWant = new Map<string, number>();
  const monthly = new Map<string, { spend: number; payments: number; refunds: number }>();

  for (const row of activityRows) {
    const cardName = cardMap.get(row.credit_card_id)?.name ?? "Unknown card";
    const cardBucket = byCard.get(cardName) ?? { spend: 0, payments: 0 };
    if (row.activity_type === "payment") cardBucket.payments += Number(row.amount);
    else cardBucket.spend += expenseImpact(row.activity_type, row.amount);
    byCard.set(cardName, cardBucket);

    const month = row.activity_date.slice(0, 7);
    const monthBucket = monthly.get(month) ?? { spend: 0, payments: 0, refunds: 0 };
    if (row.activity_type === "payment") monthBucket.payments += Number(row.amount);
    else if (row.activity_type === "refund") {
      monthBucket.refunds += Number(row.amount);
      monthBucket.spend -= Number(row.amount);
    } else if (["purchase", "fee", "interest"].includes(row.activity_type)) {
      monthBucket.spend += Number(row.amount);
    }
    monthly.set(month, monthBucket);

    const expenseAmount = expenseImpact(row.activity_type, row.amount);
    if (expenseAmount !== 0) {
      const category = row.category_id ? categoryMap.get(row.category_id) ?? "Uncategorized" : "Uncategorized";
      byCategory.set(category, (byCategory.get(category) ?? 0) + expenseAmount);
      const owner = row.owner_id ? ownerMap.get(row.owner_id) ?? "No owner" : "No owner";
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + expenseAmount);
      const needWant = row.need_want === "want" ? "Wants" : row.need_want === "need" ? "Needs" : "Unclassified";
      byNeedWant.set(needWant, (byNeedWant.get(needWant) ?? 0) + expenseAmount);
    }

    if (row.activity_type === "payment") {
      const account = row.account_id ? accountMap.get(row.account_id) ?? "Unknown account" : "No payment account";
      byPaymentAccount.set(account, (byPaymentAccount.get(account) ?? 0) + Number(row.amount));
    }
  }

  const cardBreakdown = [...byCard.entries()].sort((a, b) => b[1].spend - a[1].spend);
  const categoryRows = [...byCategory.entries()].filter(([, value]) => value !== 0).sort((a, b) => b[1] - a[1]);
  const ownerRows = [...byOwner.entries()].filter(([, value]) => value !== 0).sort((a, b) => b[1] - a[1]);
  const paymentAccountRows = [...byPaymentAccount.entries()].sort((a, b) => b[1] - a[1]);
  const needWantRows = [...byNeedWant.entries()].filter(([, value]) => value !== 0).sort((a, b) => b[1] - a[1]);
  const monthRows = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));

  const maxCategory = Math.max(...categoryRows.map(([, value]) => Math.abs(value)), 1);
  const maxOwner = Math.max(...ownerRows.map(([, value]) => Math.abs(value)), 1);
  const maxPayment = Math.max(...paymentAccountRows.map(([, value]) => value), 1);
  const maxMonth = Math.max(...monthRows.flatMap(([, value]) => [Math.max(value.spend, 0), value.payments, value.refunds]), 1);

  return (
    <main className="main">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Analyze borrowing</div>
          <h2>Credit Card Reports</h2>
          <p>Review card spending, payments, refunds, utilization, fees, owners, categories, and installment commitments.</p>
        </div>
        <div className="heading-actions">
          <Link className="secondary-btn" href="/reports">All reports</Link>
          <Link className="secondary-btn" href="/credit-cards">Card center</Link>
        </div>
      </div>

      <section className="panel report-filter-panel">
        <form className="cc-report-filter-grid" method="get">
          <div className="field"><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} /></div>
          <div className="field"><label htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} /></div>
          <div className="field"><label htmlFor="card">Credit card</label><select id="card" name="card" defaultValue={params.card ?? ""}><option value="">All cards</option>{cardRows.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_active ? "" : " (Inactive)"}</option>)}</select></div>
          <div className="field"><label htmlFor="owner">Owner</label><select id="owner" name="owner" defaultValue={params.owner ?? ""}><option value="">All owners</option>{(owners ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{(categories ?? []).filter((row) => row.category_type === "expense").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <div className="field"><label htmlFor="type">Activity</label><select id="type" name="type" defaultValue={params.type ?? ""}><option value="">All activity</option><option value="purchase">Purchases</option><option value="payment">Payments</option><option value="refund">Refunds</option><option value="fee">Fees</option><option value="interest">Interest</option></select></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Apply report</button><a className="text-btn" href="/credit-cards/reports">Reset</a></div>
        </form>
      </section>

      <section className="cards cc-report-stats">
        <div className="stat-card"><div className="stat-label">Outstanding as of {to}</div><div className={`stat-value ${totalOutstanding > 0 ? "negative" : "positive"}`}>{money(totalOutstanding)}</div><div className="stat-foot">{money(totalAvailable)} available credit</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Utilization</div><div className="stat-value">{percent(utilization)}</div><div className="stat-foot">{money(totalOutstanding)} of {money(totalLimit)}</div></div>
        <div className="stat-card"><div className="stat-label">Purchases</div><div className="stat-value negative">{money(purchases)}</div><div className="stat-foot">Gross purchases in selected period</div></div>
        <div className="stat-card"><div className="stat-label">Payments</div><div className="stat-value positive">{money(payments)}</div><div className="stat-foot">Payments made to cards</div></div>
        <div className="stat-card"><div className="stat-label">Refunds</div><div className="stat-value positive">{money(refunds)}</div><div className="stat-foot">Credits that reduced card spending</div></div>
        <div className="stat-card"><div className="stat-label">Fees + interest</div><div className="stat-value negative">{money(fees + interest)}</div><div className="stat-foot">Fees {money(fees)} · Interest {money(interest)}</div></div>
        <div className="stat-card"><div className="stat-label">Net card spending</div><div className={`stat-value ${netCardSpend > 0 ? "negative" : "positive"}`}>{money(netCardSpend)}</div><div className="stat-foot">Purchases + charges − refunds</div></div>
        <div className="stat-card"><div className="stat-label">Future installments</div><div className="stat-value">{money(scheduledFuture)}</div><div className="stat-foot">Scheduled after {to}</div></div>
      </section>

      <section className="panel cc-report-balance-note">
        <div><strong>Balance movement for this period</strong><span className="muted">Net spending minus payments. Opening balances and earlier activity are included only in the outstanding balance above.</span></div>
        <strong className={netBalanceChange > 0 ? "negative" : "positive"}>{netBalanceChange >= 0 ? "+" : "−"}{money(Math.abs(netBalanceChange))}</strong>
      </section>

      <section className="report-grid">
        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Monthly card activity</h3><p className="muted">Net card spending, payments, and refunds over the selected period.</p></div></div>
          {monthRows.length === 0 ? <div className="empty">No card activity in this period.</div> : <div className="trend-chart">{monthRows.map(([month, values]) => <div className="trend-column" key={month}><div className="trend-bars"><div className="trend-bar expense-bar" style={{ height: `${Math.max((Math.max(values.spend, 0) / maxMonth) * 100, values.spend > 0 ? 6 : 0)}%` }} title={`Net spend ${money(values.spend)}`} /><div className="trend-bar income-bar" style={{ height: `${Math.max((values.payments / maxMonth) * 100, values.payments ? 6 : 0)}%` }} title={`Payments ${money(values.payments)}`} /><div className="trend-bar savings-bar" style={{ height: `${Math.max((values.refunds / maxMonth) * 100, values.refunds ? 6 : 0)}%` }} title={`Refunds ${money(values.refunds)}`} /></div><span>{month}</span></div>)}</div>}
          <div className="chart-legend"><span><i className="legend-dot expense-dot" />Net spend</span><span><i className="legend-dot income-dot" />Payments</span><span><i className="legend-dot savings-dot" />Refunds</span></div>
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Spending by category</h3><p className="muted">Purchases, fees and interest net of refunds.</p></div></div>
          {categoryRows.length === 0 ? <div className="empty compact-empty">No categorized card spending.</div> : <div className="bar-list">{categoryRows.slice(0, 10).map(([label, value]) => <div className="bar-list-row" key={label}><div className="bar-list-meta"><span>{label}</span><strong className={value < 0 ? "positive" : ""}>{money(value)}</strong></div><div className="mini-track"><div className="mini-bar" style={{ width: `${(Math.abs(value) / maxCategory) * 100}%` }} /></div></div>)}</div>}
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Spending by owner</h3><p className="muted">Who the card expenses were charged to.</p></div></div>
          {ownerRows.length === 0 ? <div className="empty compact-empty">No owner-based card spending.</div> : <div className="bar-list">{ownerRows.slice(0, 10).map(([label, value]) => <div className="bar-list-row" key={label}><div className="bar-list-meta"><span>{label}</span><strong className={value < 0 ? "positive" : ""}>{money(value)}</strong></div><div className="mini-track"><div className="mini-bar" style={{ width: `${(Math.abs(value) / maxOwner) * 100}%` }} /></div></div>)}</div>}
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Need vs. want</h3><p className="muted">Classification of card spending in this period.</p></div></div>
          {needWantRows.length === 0 ? <div className="empty compact-empty">No classified card spending.</div> : <div className="split-metrics">{needWantRows.map(([label, value]) => <div className="split-metric" key={label}><span>{label}</span><strong>{money(value)}</strong><small>{netCardSpend > 0 ? percent((value / netCardSpend) * 100) : "0%"}</small></div>)}</div>}
        </div>

        <div className="panel report-card">
          <div className="section-heading"><div><h3>Payment source accounts</h3><p className="muted">Where your credit-card payments came from.</p></div></div>
          {paymentAccountRows.length === 0 ? <div className="empty compact-empty">No card payments in this period.</div> : <div className="bar-list">{paymentAccountRows.map(([label, value]) => <div className="bar-list-row" key={label}><div className="bar-list-meta"><span>{label}</span><strong>{money(value)}</strong></div><div className="mini-track"><div className="mini-bar cc-payment-bar" style={{ width: `${(value / maxPayment) * 100}%` }} /></div></div>)}</div>}
        </div>

        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Card exposure</h3><p className="muted">Outstanding balance, available credit, utilization, period activity, and the relevant statement cycle as of the report end date.</p></div></div>
          {cardSummaries.length === 0 ? <div className="empty">No credit cards yet.</div> : <div className="table-wrap"><table><thead><tr><th>Card</th><th>Outstanding</th><th>Limit</th><th>Available</th><th>Utilization</th><th>Period spend</th><th>Payments</th><th>Fees + interest</th><th>Statement / Due</th></tr></thead><tbody>{cardSummaries.map((card) => <tr key={card.id}><td><Link href={`/credit-cards/${card.id}`}><strong>{card.name}</strong><div className="muted cc-report-card-meta">{card.issuer || "Credit card"}{card.last4 ? ` · •••• ${card.last4}` : ""}{card.is_active ? "" : " · Inactive"}</div></Link></td><td className="amount-cell negative">{money(Math.max(card.balance, 0))}</td><td className="amount-cell">{money(Number(card.credit_limit))}</td><td className="amount-cell positive">{money(card.available)}</td><td>{percent(card.utilization)}</td><td className="amount-cell">{money(card.spend)}</td><td className="amount-cell positive">{money(card.paid)}</td><td className="amount-cell">{money(card.feesAndInterest)}</td><td><span className="cc-report-cycle">{card.cycle.end}<small>Due {card.cycle.dueDate}</small></span></td></tr>)}</tbody></table></div>}
        </div>

        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Card comparison</h3><p className="muted">Net spending and payments by card for the selected period.</p></div></div>
          {cardBreakdown.length === 0 ? <div className="empty compact-empty">No card activity to compare.</div> : <div className="cc-card-comparison">{cardBreakdown.map(([label, values]) => <div className="cc-card-comparison-row" key={label}><div><strong>{label}</strong><span className="muted">Net spend {money(values.spend)}</span></div><div className="cc-comparison-values"><span>Payments <strong>{money(values.payments)}</strong></span><span>Net movement <strong className={values.spend - values.payments > 0 ? "negative" : "positive"}>{money(values.spend - values.payments)}</strong></span></div></div>)}</div>}
        </div>

        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Upcoming installment charges</h3><p className="muted">Scheduled installment charges after the report end date. These are not yet included in outstanding balances until their activity date.</p></div><strong>{money(scheduledFuture)}</strong></div>
          {futureRows.length === 0 ? <div className="empty compact-empty">No future installment charges.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Card</th><th>Description</th><th>Installment</th><th>Amount</th></tr></thead><tbody>{futureRows.slice(0, 24).map((row) => <tr key={row.id}><td>{row.activity_date}</td><td>{cardMap.get(row.credit_card_id)?.name ?? "Unknown card"}</td><td>{row.description || "Installment"}</td><td>{row.installment_sequence && row.installment_total ? `${row.installment_sequence}/${row.installment_total}` : "—"}</td><td className="amount-cell">{money(Number(row.amount))}</td></tr>)}</tbody></table></div>}
        </div>

        <div className="panel report-card span-2">
          <div className="section-heading"><div><h3>Activity detail</h3><p className="muted">Posted and scheduled card activity inside the selected report period.</p></div><strong>{activityRows.length} entries</strong></div>
          {activityRows.length === 0 ? <div className="empty">No card activity in this period.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Card</th><th>Description</th><th>Type</th><th>Category / Account</th><th>Owner</th><th>Classification</th><th>Balance impact</th></tr></thead><tbody>{activityRows.slice(0, 100).map((row) => {
            const impact = creditCardImpact(row.activity_type, row.amount);
            const secondary = row.activity_type === "payment" ? accountMap.get(row.account_id ?? "") ?? "Payment account" : categoryMap.get(row.category_id ?? "") ?? "Uncategorized";
            const classification = row.activity_type === "payment" ? "—" : [row.need_want === "need" ? "Need" : row.need_want === "want" ? "Want" : null, row.fixed_variable === "fixed" ? "Fixed" : row.fixed_variable === "variable" ? "Variable" : null].filter(Boolean).join(" · ") || "—";
            return <tr key={row.id}><td>{row.activity_date}</td><td>{cardMap.get(row.credit_card_id)?.name ?? "Unknown card"}</td><td>{row.description || activityLabel(row.activity_type)}{row.installment_sequence && row.installment_total ? <div className="muted cc-report-card-meta">Installment {row.installment_sequence}/{row.installment_total}</div> : null}</td><td><span className={`cc-activity-badge cc-${row.activity_type}`}>{activityLabel(row.activity_type)}</span></td><td>{secondary}</td><td>{row.owner_id ? ownerMap.get(row.owner_id) ?? "—" : "—"}</td><td>{classification}</td><td className={`${impact < 0 ? "positive" : "negative"} amount-cell`}>{impact < 0 ? "−" : "+"}{money(Math.abs(impact))}</td></tr>;
          })}</tbody></table></div>}
          {activityRows.length > 100 && <p className="muted cc-report-limit-note">Showing the newest 100 rows for this period. Narrow the date range or filters to review older entries.</p>}
        </div>
      </section>
    </main>
  );
}
