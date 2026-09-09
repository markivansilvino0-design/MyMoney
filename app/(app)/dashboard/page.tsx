import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { savingsGoalImpact } from "@/lib/finance";

function currentMonthParts() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { monthStart: `${year}-${month}-01`, today: `${year}-${month}-${day}`, monthLabel: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date()) };
}

function pctLabel(value: number) {
  if (!Number.isFinite(value)) return "0%";
  if (value > 0 && value < 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(0)}%`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { monthStart, today, monthLabel } = currentMonthParts();

  const [
    { data: monthTransactions },
    { data: recentTransactions },
    { data: goals },
    { data: monthContributions },
    { data: recentContributions },
    { data: monthCardActivity },
    { data: recentCardActivity },
    { data: recurringOccurrences },
    { data: recurringRules },
  ] = await Promise.all([
    supabase.from("transactions").select("transaction_type,amount").gte("transaction_date", monthStart),
    supabase.from("transactions").select("id,transaction_date,transaction_type,amount,description,created_at").order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    supabase.from("savings_goals").select("id,name,target_amount,current_amount").eq("status", "active").order("created_at", { ascending: true }).limit(4),
    supabase.from("savings_contributions").select("amount,entry_type,contribution_date").gte("contribution_date", monthStart),
    supabase.from("savings_contributions").select("id,contribution_date,amount,entry_type,description,notes,created_at").order("contribution_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    supabase.from("credit_card_transactions").select("activity_type,amount").gte("activity_date", monthStart).lte("activity_date", today),
    supabase.from("credit_card_transactions").select("id,credit_card_id,activity_date,activity_type,amount,description,created_at").lte("activity_date", today).order("activity_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    supabase.from("recurring_occurrences").select("id,recurring_rule_id,due_date,amount,status").eq("status", "scheduled").lte("due_date", addDays(today, 7)).order("due_date").limit(6),
    supabase.from("recurring_rules").select("id,name,rule_type,auto_post,status").eq("status", "active"),
  ]);

  const monthRows = monthTransactions ?? [];
  const income = monthRows.filter((transaction) => transaction.transaction_type === "income").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const cashExpenses = monthRows.filter((transaction) => transaction.transaction_type === "expense").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const cardExpenses = (monthCardActivity ?? []).reduce((sum, row) => {
    const amount = Number(row.amount);
    if (["purchase", "fee", "interest"].includes(row.activity_type)) return sum + amount;
    if (row.activity_type === "refund") return sum - amount;
    return sum;
  }, 0);
  const expenses = cashExpenses + cardExpenses;
  const savings = (monthContributions ?? []).reduce((sum, entry) => sum + savingsGoalImpact(entry.entry_type, entry.amount), 0);
  const available = income - expenses - savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const expenseRate = income > 0 ? (expenses / income) * 100 : 0;

  const recent = [
    ...(recentTransactions ?? []).map((transaction) => ({ kind: "tx", id: transaction.id, cardId: "", date: transaction.transaction_date, type: transaction.transaction_type, entryType: "", amount: Number(transaction.amount), description: transaction.description || (transaction.transaction_type === "transfer" ? "Account transfer" : "—"), created_at: transaction.created_at })),
    ...(recentContributions ?? []).map((entry) => ({ kind: "sv", id: entry.id, cardId: "", date: entry.contribution_date, type: "savings", entryType: entry.entry_type ?? "deposit", amount: Number(entry.amount), description: entry.description || entry.notes || (entry.entry_type === "withdrawal" ? "Savings withdrawal" : "Savings deposit"), created_at: entry.created_at })),
    ...(recentCardActivity ?? []).map((entry) => ({ kind: "cc", id: entry.id, cardId: entry.credit_card_id, date: entry.activity_date, type: "credit_card", entryType: entry.activity_type, amount: Number(entry.amount), description: entry.description || `Credit card ${entry.activity_type}`, created_at: entry.created_at })),
  ].sort((a, b) => `${b.date} ${b.created_at}`.localeCompare(`${a.date} ${a.created_at}`)).slice(0, 8);

  const recurringRuleMap = new Map((recurringRules ?? []).map((rule) => [rule.id, rule]));
  const recurringSoon = (recurringOccurrences ?? []).map((occurrence) => ({ ...occurrence, rule: recurringRuleMap.get(occurrence.recurring_rule_id) })).filter((entry) => entry.rule);

  return (
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">Overview · {monthLabel}</div><h2>Dashboard</h2><p>A clean view of what came in, went out, and stayed with you.</p></div>
        <div className="heading-actions"><Link className="secondary-btn" href="/reports">View reports</Link><Link className="primary-btn" href="/transactions">+ Add transaction</Link></div>
      </div>

      <section className="cards dashboard-stats">
        <div className="stat-card stat-income"><div className="stat-top"><div className="stat-label">Income</div><div className="stat-icon">↗</div></div><div className="stat-value positive">{money(income)}</div><div className="stat-foot">Received this month</div></div>
        <div className="stat-card stat-expense"><div className="stat-top"><div className="stat-label">Expenses</div><div className="stat-icon">↘</div></div><div className="stat-value negative">{money(expenses)}</div><div className="stat-foot">{pctLabel(expenseRate)} of income</div></div>
        <div className="stat-card stat-savings"><div className="stat-top"><div className="stat-label">Net savings</div><div className="stat-icon">◎</div></div><div className={`stat-value ${savings < 0 ? "negative" : "positive"}`}>{money(savings)}</div><div className="stat-foot">Savings rate {pctLabel(savingsRate)}</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-top"><div className="stat-label">Available</div><div className="stat-icon">₱</div></div><div className={`stat-value ${available < 0 ? "negative" : ""}`}>{money(available)}</div><div className="stat-foot">After spending and savings</div></div>
      </section>

      <section className="grid-2 dashboard-grid">
        <div className="panel">
          <div className="section-heading"><div><h3>Monthly money flow</h3><p className="muted">See how much of your income is being used.</p></div><Link className="text-btn" href="/reports">Details</Link></div>
          {income === 0 && expenses === 0 ? <div className="empty">No income or expense transactions yet.</div> : (
            <div className="flow-stack">
              <div className="flow-row"><div className="flow-meta"><span><i className="legend-dot income-dot" />Income</span><strong>{money(income)}</strong></div><div className="progress-track"><div className="progress-bar income-progress" style={{ width: "100%" }} /></div></div>
              <div className="flow-row"><div className="flow-meta"><span><i className="legend-dot expense-dot" />Expenses</span><strong>{money(expenses)}</strong></div><div className="progress-track"><div className="progress-bar expense-progress" style={{ width: `${Math.min(expenseRate, 100)}%` }} /></div></div>
              <div className="flow-row"><div className="flow-meta"><span><i className="legend-dot savings-dot" />Savings</span><strong>{money(savings)}</strong></div><div className="progress-track"><div className="progress-bar savings-progress" style={{ width: `${Math.min(Math.max(savingsRate, 0), 100)}%` }} /></div></div>
            </div>
          )}
        </div>
        <div className="panel">
          <div className="section-heading"><div><h3>Savings goals</h3><p className="muted">Progress toward your active goals.</p></div><Link className="text-btn" href="/savings">View all</Link></div>
          {(goals ?? []).length === 0 ? <div className="empty">No active savings goals yet.</div> : <div className="goal-stack">{goals!.map((goal) => {
            const target = Number(goal.target_amount);
            const current = Number(goal.current_amount);
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            return <Link href={`/savings/${goal.id}`} className="goal-row modern-goal-row" key={goal.id}><div className="goal-meta"><strong>{goal.name}</strong><span className="goal-pct">{pctLabel(pct)}</span></div><div className="progress-track"><div className="progress-bar" style={{ width: `${pct}%` }} /></div><div className="goal-meta muted"><span>{money(current)}</span><span>{money(target)}</span></div></Link>;
          })}</div>}
        </div>
      </section>

      {recurringSoon.length > 0 && <section className="panel recurring-dashboard-panel">
        <div className="section-heading"><div><h3>Due & upcoming</h3><p className="muted">Recurring items due today or within the next 7 days.</p></div><Link className="text-btn" href="/recurring">Open recurring</Link></div>
        <div className="dashboard-recurring-list">{recurringSoon.map((entry) => {
          const rule = entry.rule!;
          const due = entry.due_date <= today;
          return <Link href="/recurring" className={`dashboard-recurring-row ${due ? "is-due" : ""}`} key={entry.id}><div><strong>{rule.name}</strong><span>{due ? (entry.due_date < today ? "Overdue" : "Due today") : `Due ${entry.due_date}`} · {rule.auto_post ? "Auto-post" : "Manual"}</span></div><strong>{money(entry.amount)}</strong></Link>;
        })}</div>
      </section>}

      <section className="panel recent-panel">
        <div className="section-heading"><div><h3>Recent activity</h3><p className="muted">Your latest money movements.</p></div><Link className="text-btn" href="/transactions">View all</Link></div>
        {recent.length === 0 ? <div className="empty">Your recent transactions will appear here.</div> : (
          <div className="table-wrap"><table className="modern-table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead><tbody>{recent.map((entry) => {
            const savingsWithdrawal = entry.type === "savings" && entry.entryType === "withdrawal";
            const cardRefund = entry.type === "credit_card" && entry.entryType === "refund";
            const cardPayment = entry.type === "credit_card" && entry.entryType === "payment";
            const positive = entry.type === "income" || savingsWithdrawal || cardRefund;
            const negative = entry.type === "expense" || (entry.type === "savings" && !savingsWithdrawal) || (entry.type === "credit_card" && !cardRefund && !cardPayment);
            const label = entry.type === "savings" ? (savingsWithdrawal ? "savings withdrawal" : "savings deposit") : entry.type === "credit_card" ? `card ${entry.entryType}` : entry.type;
            const href = entry.kind === "cc" ? `/credit-cards/${entry.cardId}` : `/transactions/${entry.kind}/${entry.id}`;
            return <tr key={`${entry.kind}-${entry.id}`}><td><Link href={href}>{entry.date}</Link></td><td><Link href={href}><strong>{entry.description}</strong></Link></td><td><Link href={href}><span className={`type-badge type-${entry.type}`}>{label}</span></Link></td><td className={positive ? "positive amount-cell" : negative ? "negative amount-cell" : "amount-cell"}><Link href={href}>{positive ? "+" : negative ? "−" : "↔ "}{money(entry.amount)}</Link></td></tr>;
          })}</tbody></table></div>
        )}
      </section>
    </main>
  );
}
