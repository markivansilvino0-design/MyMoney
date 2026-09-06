import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { copyPreviousMonthBudgets, deleteBudget, saveBudget } from "./actions";

type Params = Promise<{ month?: string; success?: string; error?: string }>;

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

export default async function BudgetPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const month = normalizeMonth(params.month);
  const monthStart = `${month}-01`;
  const end = monthEnd(month);
  const supabase = await createClient();

  const [{ data: categories }, { data: budgets }, { data: expenses }] = await Promise.all([
    supabase.from("categories").select("id,name").eq("category_type", "expense").eq("is_active", true).order("name"),
    supabase.from("budgets").select("id,category_id,budget_amount").eq("month_start", monthStart),
    supabase.from("transactions").select("category_id,amount").eq("transaction_type", "expense").gte("transaction_date", monthStart).lte("transaction_date", end),
  ]);

  const categoryRows = categories ?? [];
  const budgetMap = new Map((budgets ?? []).map((row) => [row.category_id, row]));
  const actualMap = new Map<string, number>();
  for (const row of expenses ?? []) {
    if (!row.category_id) continue;
    actualMap.set(row.category_id, (actualMap.get(row.category_id) ?? 0) + Number(row.amount));
  }

  const rows = categoryRows.map((category) => {
    const budget = budgetMap.get(category.id);
    const planned = Number(budget?.budget_amount ?? 0);
    const actual = actualMap.get(category.id) ?? 0;
    const remaining = planned - actual;
    const usage = planned > 0 ? (actual / planned) * 100 : actual > 0 ? 100 : 0;
    return { ...category, budgetId: budget?.id ?? null, planned, actual, remaining, usage };
  });

  const totalBudget = rows.reduce((sum, row) => sum + row.planned, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.actual, 0);
  const remaining = totalBudget - totalSpent;
  const usedPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const overBudget = rows.filter((row) => row.planned > 0 && row.actual > row.planned).length;

  return (
    <main className="main">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Plan</div>
          <h2>Budget</h2>
          <p>Set monthly category limits and see actual spending update automatically.</p>
        </div>
        <div className="month-switcher">
          <Link className="icon-btn" href={`/budget?month=${shiftMonth(month, -1)}`} aria-label="Previous month">←</Link>
          <div className="month-chip">{monthLabel(month)}</div>
          <Link className="icon-btn" href={`/budget?month=${shiftMonth(month, 1)}`} aria-label="Next month">→</Link>
        </div>
      </div>

      {params.error && <div className="notice error page-notice">{params.error}</div>}
      {params.success && <div className="notice success page-notice">{params.success}</div>}

      <section className="cards budget-stats">
        <div className="stat-card stat-card-accent"><div className="stat-label">Monthly budget</div><div className="stat-value">{money(totalBudget)}</div><div className="stat-foot">Across {rows.filter((r) => r.planned > 0).length} categories</div></div>
        <div className="stat-card"><div className="stat-label">Spent</div><div className="stat-value negative">{money(totalSpent)}</div><div className="stat-foot">{usedPct.toFixed(1)}% of plan</div></div>
        <div className="stat-card"><div className="stat-label">Remaining</div><div className={`stat-value ${remaining < 0 ? "negative" : "positive"}`}>{money(remaining)}</div><div className="stat-foot">Available within budget</div></div>
        <div className="stat-card"><div className="stat-label">Over budget</div><div className={`stat-value ${overBudget > 0 ? "negative" : ""}`}>{overBudget}</div><div className="stat-foot">Categories over their limit</div></div>
      </section>

      <section className="panel budget-overview-panel">
        <div className="section-heading">
          <div><h3>Budget health</h3><p className="muted">Your total monthly plan versus actual expenses.</p></div>
          <form action={copyPreviousMonthBudgets}>
            <input type="hidden" name="month" value={month} />
            <button className="secondary-btn" type="submit">Copy previous month</button>
          </form>
        </div>
        <div className="budget-health-row">
          <div className="ring-metric" style={{ "--value": `${Math.min(usedPct, 100)}%` } as CSSProperties}><div><strong>{usedPct.toFixed(0)}%</strong><span>used</span></div></div>
          <div className="budget-health-copy"><strong>{remaining >= 0 ? `${money(remaining)} still available` : `${money(Math.abs(remaining))} over plan`}</strong><span className="muted">Actual spending is pulled directly from your Expense transactions for {monthLabel(month)}.</span></div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><div><h3>Category budgets</h3><p className="muted">Edit any category amount and save it without re-entering your transactions.</p></div><strong>{rows.length} categories</strong></div>
        {rows.length === 0 ? <div className="empty">No active expense categories yet.</div> : (
          <div className="budget-list">
            {rows.map((row) => {
              const pct = Math.min(row.usage, 100);
              const status = row.planned === 0 && row.actual > 0 ? "Unbudgeted" : row.remaining < 0 ? "Over" : row.usage >= 80 ? "Watch" : "On track";
              return (
                <article className="budget-row" key={row.id}>
                  <div className="budget-row-main">
                    <div className="budget-row-title"><strong>{row.name}</strong><span className={`status-badge ${status === "Over" ? "status-danger" : status === "Watch" ? "status-warning" : status === "Unbudgeted" ? "status-muted" : "status-active"}`}>{status}</span></div>
                    <div className="progress-track budget-progress"><div className={`progress-bar ${row.remaining < 0 ? "progress-danger" : row.usage >= 80 ? "progress-warning" : ""}`} style={{ width: `${pct}%` }} /></div>
                    <div className="budget-row-meta"><span>{money(row.actual)} spent</span><span>{row.planned > 0 ? `${money(row.remaining)} remaining` : "No budget set"}</span></div>
                  </div>
                  <form action={saveBudget} className="budget-inline-form">
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="category_id" value={row.id} />
                    <label className="sr-only" htmlFor={`budget-${row.id}`}>Budget for {row.name}</label>
                    <div className="money-input-wrap"><span>₱</span><input id={`budget-${row.id}`} name="budget_amount" type="number" min="0" step="0.01" defaultValue={row.planned} /></div>
                    <button className="primary-btn compact-btn" type="submit">Save</button>
                  </form>
                  {row.budgetId && <form action={deleteBudget} className="budget-delete-form"><input type="hidden" name="month" value={month} /><input type="hidden" name="id" value={row.budgetId} /><button className="icon-btn danger-icon-btn" type="submit" title="Remove budget">×</button></form>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
