import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { accountBalance } from "@/lib/finance";
import {
  applyBudgetTemplate,
  copyPreviousMonthBudgets,
  deleteBudget,
  deleteBudgetTemplate,
  saveBudget,
  saveBudgetTemplate,
} from "./actions";

type Params = Promise<{ month?: string; owner?: string; success?: string; error?: string }>;

type SpendRow = { category_id: string | null; owner_id: string | null; amount: number | string; transaction_type?: string; activity_type?: string };

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function manilaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

function normalizeMonth(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : manilaMonth();
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function spendMap(rows: SpendRow[], ownerFilter: string | null) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.category_id) continue;
    if (ownerFilter && row.owner_id !== ownerFilter) continue;
    const signed = row.activity_type === "refund" ? -Number(row.amount) : Number(row.amount);
    const key = ownerFilter ? row.category_id : `${row.owner_id ?? "none"}:${row.category_id}`;
    map.set(key, (map.get(key) ?? 0) + signed);
  }
  return map;
}

function alertLabel(usage: number, planned: number, actual: number) {
  if (planned <= 0 && actual > 0) return { label: "Unbudgeted", level: "danger" };
  if (usage >= 100) return { label: "100%+", level: "danger" };
  if (usage >= 90) return { label: "90%", level: "warning" };
  if (usage >= 75) return { label: "75%", level: "watch" };
  if (usage >= 50) return { label: "50%", level: "info" };
  return null;
}

export default async function BudgetPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const month = normalizeMonth(params.month);
  const monthStart = `${month}-01`;
  const end = monthEnd(month);
  const previousMonth = shiftMonth(month, -1);
  const previousStart = `${previousMonth}-01`;
  const previousEnd = monthEnd(previousMonth);
  const today = manilaToday();
  const postedEnd = end < today ? end : today;
  const previousPostedEnd = previousEnd < today ? previousEnd : today;
  const supabase = await createClient();

  const [
    { data: categories },
    { data: owners },
    { data: budgets },
    { data: previousBudgets },
    { data: expenses },
    { data: previousExpenses },
    { data: cardExpenses },
    { data: previousCardExpenses },
    { data: accounts },
    { data: allTransactions },
    { data: allSavings },
    { data: cardPayments },
    { data: loans },
    { data: loanPayments },
    { data: templates },
  ] = await Promise.all([
    supabase.from("categories").select("id,name").eq("category_type", "expense").eq("is_active", true).order("name"),
    supabase.from("owners").select("id,name,is_default,is_active").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    supabase.from("budgets").select("id,category_id,owner_id,budget_amount,rollover_enabled").eq("month_start", monthStart),
    supabase.from("budgets").select("category_id,owner_id,budget_amount,rollover_enabled").eq("month_start", previousStart),
    supabase.from("transactions").select("category_id,owner_id,amount").eq("transaction_type", "expense").gte("transaction_date", monthStart).lte("transaction_date", end),
    supabase.from("transactions").select("category_id,owner_id,amount").eq("transaction_type", "expense").gte("transaction_date", previousStart).lte("transaction_date", previousEnd),
    supabase.from("credit_card_transactions").select("activity_type,category_id,owner_id,amount").in("activity_type", ["purchase", "refund", "fee", "interest"]).gte("activity_date", monthStart).lte("activity_date", postedEnd),
    supabase.from("credit_card_transactions").select("activity_type,category_id,owner_id,amount").in("activity_type", ["purchase", "refund", "fee", "interest"]).gte("activity_date", previousStart).lte("activity_date", previousPostedEnd),
    supabase.from("accounts").select("id,name,account_type,opening_balance,is_active").eq("is_active", true).order("name"),
    supabase.from("transactions").select("transaction_type,account_id,to_account_id,amount"),
    supabase.from("savings_contributions").select("savings_goal_id,from_account_id,to_account_id,saving_mode,entry_type,amount"),
    supabase.from("credit_card_transactions").select("activity_type,account_id,amount").eq("activity_type", "payment"),
    supabase.from("loans").select("loan_type,funding_account_id,principal_amount,record_initial_cash"),
    supabase.from("loan_payments").select("account_id,principal_amount,interest_amount,loans(loan_type)"),
    supabase.from("budget_templates").select("id,name,owner_id").order("name"),
  ]);

  const ownerRows = owners ?? [];
  const defaultOwner = ownerRows.find((owner) => owner.is_default) ?? ownerRows[0];
  const selectedOwner = params.owner === "all" ? "all" : ownerRows.some((owner) => owner.id === params.owner) ? params.owner! : defaultOwner?.id ?? "all";
  const ownerFilter = selectedOwner === "all" ? null : selectedOwner;
  const ownerName = selectedOwner === "all" ? "All Owners" : ownerRows.find((owner) => owner.id === selectedOwner)?.name ?? "Owner";
  const categoryRows = categories ?? [];
  const currentBudgetRows = budgets ?? [];
  const previousBudgetRows = previousBudgets ?? [];
  const currentSpendRows = [...((expenses ?? []) as SpendRow[]), ...((cardExpenses ?? []) as SpendRow[])];
  const previousSpendRows = [...((previousExpenses ?? []) as SpendRow[]), ...((previousCardExpenses ?? []) as SpendRow[])];
  const currentSpend = spendMap(currentSpendRows, ownerFilter);
  const previousSpend = spendMap(previousSpendRows, null);

  const currentBudgetMap = new Map(currentBudgetRows.map((row) => [`${row.owner_id}:${row.category_id}`, row]));
  const previousBudgetMap = new Map(previousBudgetRows.map((row) => [`${row.owner_id}:${row.category_id}`, row]));

  const allViewOwners = selectedOwner === "all"
    ? [...ownerRows, ...(Array.from(currentSpend.keys()).some((key) => key.startsWith("none:")) ? [{ id: "none", name: "Unassigned", is_default: false, is_active: true }] : [])]
    : ownerRows;
  const detailedRows = selectedOwner === "all"
    ? allViewOwners.flatMap((owner) => categoryRows.map((category) => ({ owner, category })))
    : categoryRows.map((category) => ({ owner: ownerRows.find((owner) => owner.id === selectedOwner)!, category }));

  const rows = detailedRows.map(({ owner, category }) => {
    const budget = currentBudgetMap.get(`${owner?.id}:${category.id}`);
    const previous = previousBudgetMap.get(`${owner?.id}:${category.id}`);
    const previousActual = previousSpend.get(`${owner?.id}:${category.id}`) ?? 0;
    const carryIn = previous?.rollover_enabled ? Math.max(Number(previous.budget_amount) - previousActual, 0) : 0;
    const base = Number(budget?.budget_amount ?? 0);
    const planned = base + carryIn;
    const actualKey = selectedOwner === "all" ? `${owner?.id ?? "none"}:${category.id}` : category.id;
    const actual = currentSpend.get(actualKey) ?? 0;
    const remaining = planned - actual;
    const usage = planned > 0 ? (actual / planned) * 100 : actual > 0 ? 100 : 0;
    return {
      ownerId: owner?.id ?? "",
      ownerName: owner?.name ?? "No owner",
      categoryId: category.id,
      categoryName: category.name,
      budgetId: budget?.id ?? null,
      base,
      carryIn,
      planned,
      actual,
      remaining,
      usage,
      rolloverEnabled: Boolean(budget?.rollover_enabled),
      alert: alertLabel(usage, planned, actual),
    };
  });

  const visibleRows = selectedOwner === "all" ? rows.filter((row) => row.planned > 0 || row.actual > 0) : rows;
  const totalBudget = rows.reduce((sum, row) => sum + row.planned, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.actual, 0);
  const remaining = totalBudget - totalSpent;
  const usedPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const overBudget = rows.filter((row) => row.planned > 0 && row.actual > row.planned).length;
  const unbudgeted = rows.filter((row) => row.planned <= 0 && row.actual > 0).length;

  const accountRows = accounts ?? [];
  const balances = accountRows.map((account) => ({
    ...account,
    balance: accountBalance(account, allTransactions ?? [], allSavings ?? [], cardPayments ?? [], loans ?? [], loanPayments ?? []),
  }));
  const liquidBalance = balances
    .filter((account) => ["cash", "bank", "ewallet", "savings"].includes(account.account_type))
    .reduce((sum, account) => sum + Math.max(account.balance, 0), 0);

  const allocatedByAccount = new Map<string, number>();
  for (const row of allSavings ?? []) {
    const amount = Number(row.amount);
    const sign = row.entry_type === "withdrawal" ? -1 : 1;
    const accountId = row.saving_mode === "transfer"
      ? (row.entry_type === "withdrawal" ? row.from_account_id : row.to_account_id)
      : row.from_account_id;
    if (!accountId) continue;
    allocatedByAccount.set(accountId, (allocatedByAccount.get(accountId) ?? 0) + sign * amount);
  }
  const allocatedSavings = Array.from(allocatedByAccount.values()).reduce((sum, amount) => sum + Math.max(amount, 0), 0);
  const remainingBudgetCommitment = rows.reduce((sum, row) => sum + Math.max(row.remaining, 0), 0);
  const safeToSpend = Math.max(liquidBalance - allocatedSavings - remainingBudgetCommitment, 0);

  const templateRows = (templates ?? []).filter((template) => template.owner_id === selectedOwner);

  return (
    <main className="main">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Plan</div>
          <h2>Budget</h2>
          <p>Control monthly spending by owner, reuse templates, roll unused limits forward and watch budget alerts.</p>
        </div>
        <div className="month-switcher">
          <Link className="icon-btn" href={`/budget?month=${shiftMonth(month, -1)}&owner=${selectedOwner}`} aria-label="Previous month">←</Link>
          <div className="month-chip">{monthLabel(month)}</div>
          <Link className="icon-btn" href={`/budget?month=${shiftMonth(month, 1)}&owner=${selectedOwner}`} aria-label="Next month">→</Link>
        </div>
      </div>

      {params.error && <div className="notice error page-notice">{params.error}</div>}
      {params.success && <div className="notice success page-notice">{params.success}</div>}

      <section className="panel budget-owner-bar">
        <form method="get" className="budget-owner-filter">
          <input type="hidden" name="month" value={month} />
          <div className="field"><label htmlFor="owner">Budget owner</label><select id="owner" name="owner" defaultValue={selectedOwner}><option value="all">All Owners</option>{ownerRows.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}{owner.is_default ? " (default)" : ""}</option>)}</select></div>
          <div className="filter-actions"><button className="secondary-btn" type="submit">View budget</button></div>
        </form>
        <div className="budget-owner-copy"><strong>{ownerName}</strong><span className="muted">{selectedOwner === "all" ? "Combined view; choose an owner to edit." : "Budget amounts and actual expenses are matched to this owner."}</span></div>
      </section>

      <section className="cards budget-stats">
        <div className="stat-card stat-card-accent"><div className="stat-label">Effective budget</div><div className="stat-value">{money(totalBudget)}</div><div className="stat-foot">Base budget + eligible rollover</div></div>
        <div className="stat-card"><div className="stat-label">Spent</div><div className="stat-value negative">{money(totalSpent)}</div><div className="stat-foot">{usedPct.toFixed(1)}% of plan</div></div>
        <div className="stat-card"><div className="stat-label">Remaining</div><div className={`stat-value ${remaining < 0 ? "negative" : "positive"}`}>{money(remaining)}</div><div className="stat-foot">Within this budget view</div></div>
        <div className="stat-card"><div className="stat-label">Safe to spend</div><div className="stat-value positive">{money(safeToSpend)}</div><div className="stat-foot">Liquid cash − goal allocations − remaining budget</div></div>
      </section>

      {(overBudget > 0 || unbudgeted > 0) && (
        <section className="budget-alert-strip">
          {overBudget > 0 && <div className="budget-alert danger"><strong>{overBudget}</strong><span>categor{overBudget === 1 ? "y is" : "ies are"} over budget.</span></div>}
          {unbudgeted > 0 && <div className="budget-alert warning"><strong>{unbudgeted}</strong><span>categor{unbudgeted === 1 ? "y has" : "ies have"} spending without a budget.</span></div>}
        </section>
      )}

      {selectedOwner !== "all" && (
        <section className="two-column budget-tools-grid">
          <div className="panel">
            <div className="section-heading"><div><h3>Quick setup</h3><p className="muted">Reuse last month or turn the current plan into a template.</p></div></div>
            <div className="budget-tool-actions">
              <form action={copyPreviousMonthBudgets}><input type="hidden" name="month" value={month} /><input type="hidden" name="owner_id" value={selectedOwner} /><button className="secondary-btn" type="submit">Copy previous month</button></form>
              <form action={saveBudgetTemplate} className="budget-template-save"><input type="hidden" name="month" value={month} /><input type="hidden" name="owner_id" value={selectedOwner} /><input name="template_name" placeholder="Template name" required /><button className="secondary-btn" type="submit">Save template</button></form>
            </div>
          </div>
          <div className="panel">
            <div className="section-heading"><div><h3>Monthly templates</h3><p className="muted">Apply a saved category plan for {ownerName}.</p></div></div>
            {templateRows.length === 0 ? <div className="empty compact-empty">No templates for this owner yet.</div> : <div className="budget-template-list">{templateRows.map((template) => <div className="budget-template-row" key={template.id}><strong>{template.name}</strong><div><form action={applyBudgetTemplate}><input type="hidden" name="month" value={month} /><input type="hidden" name="owner_id" value={selectedOwner} /><input type="hidden" name="template_id" value={template.id} /><button className="secondary-btn small-btn" type="submit">Apply</button></form><form action={deleteBudgetTemplate}><input type="hidden" name="month" value={month} /><input type="hidden" name="owner_id" value={selectedOwner} /><input type="hidden" name="template_id" value={template.id} /><button className="text-btn danger-text" type="submit">Delete</button></form></div></div>)}</div>}
          </div>
        </section>
      )}

      <section className="panel budget-overview-panel">
        <div className="section-heading"><div><h3>{ownerName} budget health</h3><p className="muted">Alerts appear at 50%, 75%, 90% and 100% usage. Rollover uses unused budget from the immediately previous month.</p></div><div className="budget-legend"><span>{money(liquidBalance)} liquid</span><span>{money(allocatedSavings)} allocated to savings</span></div></div>
        <div className="progress-track budget-total-track"><div className={`progress-bar ${usedPct >= 100 ? "progress-danger" : usedPct >= 90 ? "progress-warning" : ""}`} style={{ width: `${Math.min(Math.max(usedPct, 0), 100)}%` }} /></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Category budgets</h3><p className="muted">{selectedOwner === "all" ? "Combined owner/category activity. Choose an owner above to edit limits." : "Set a base monthly limit and optionally allow unused money to roll into next month."}</p></div><strong>{visibleRows.filter((row) => row.planned > 0).length} active lines</strong></div>
        {categoryRows.length === 0 ? <div className="empty">No active expense categories. Add one in Settings.</div> : (
          <div className="budget-category-list">
            {visibleRows.map((row) => {
              const width = Math.min(Math.max(row.usage, 0), 100);
              const progressClass = row.usage >= 100 ? "progress-danger" : row.usage >= 90 ? "progress-warning" : row.usage >= 75 ? "progress-watch" : "";
              return (
                <article className="budget-category-row" key={`${row.ownerId}-${row.categoryId}`}>
                  <div className="budget-category-head">
                    <div><strong>{row.categoryName}</strong>{selectedOwner === "all" && <span className="owner-chip">{row.ownerName}</span>}{row.alert && <span className={`budget-alert-badge ${row.alert.level}`}>{row.alert.label}</span>}</div>
                    <div className="budget-category-figures"><span>Spent <strong>{money(row.actual)}</strong></span><span>Plan <strong>{money(row.planned)}</strong></span><span className={row.remaining < 0 ? "negative" : "positive"}>{row.remaining < 0 ? "Over" : "Left"} <strong>{money(Math.abs(row.remaining))}</strong></span></div>
                  </div>
                  <div className="progress-track"><div className={`progress-bar ${progressClass}`} style={{ width: `${width}%` } as CSSProperties} /></div>
                  {row.carryIn > 0 && <div className="rollover-note">Includes {money(row.carryIn)} rollover from {monthLabel(previousMonth)}.</div>}
                  {selectedOwner !== "all" && (
                    <div className="budget-row-editor">
                      <form action={saveBudget} className="budget-inline-form">
                        <input type="hidden" name="month" value={month} /><input type="hidden" name="owner_id" value={selectedOwner} /><input type="hidden" name="category_id" value={row.categoryId} />
                        <div className="field"><label>Base budget</label><input name="budget_amount" type="number" min="0" step="0.01" defaultValue={row.base || ""} placeholder="0.00" /></div>
                        <label className="budget-rollover-toggle"><input type="checkbox" name="rollover_enabled" defaultChecked={row.rolloverEnabled} /><span><strong>Rollover</strong><small>Carry unused base limit into next month</small></span></label>
                        <button className="secondary-btn small-btn" type="submit">Save</button>
                      </form>
                      {row.budgetId && <form action={deleteBudget}><input type="hidden" name="month" value={month} /><input type="hidden" name="owner_id" value={selectedOwner} /><input type="hidden" name="id" value={row.budgetId} /><button className="danger-icon-btn" type="submit" title="Remove budget">×</button></form>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel safe-spend-panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Safe-to-Spend breakdown</h3><p className="muted">A conservative estimate based on money already in liquid accounts, savings allocations and the remaining budget shown above.</p></div></div>
        <div className="safe-spend-equation"><div><span>Liquid account money</span><strong>{money(liquidBalance)}</strong></div><b>−</b><div><span>Savings allocations</span><strong>{money(allocatedSavings)}</strong></div><b>−</b><div><span>Remaining budget</span><strong>{money(remainingBudgetCommitment)}</strong></div><b>=</b><div className="safe-result"><span>Safe to spend</span><strong>{money(safeToSpend)}</strong></div></div>
        <p className="muted safe-spend-note">Safe-to-Spend is a planning estimate, not an account balance. It does not yet reserve future obligations that are outside your current budget.</p>
      </section>
    </main>
  );
}
