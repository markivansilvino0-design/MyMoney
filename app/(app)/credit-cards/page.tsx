import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { availableCredit, creditCardBalance, defaultStatementMonth, statementPeriodForMonth, utilizationRate } from "@/lib/credit-cards";
import { createCreditCard } from "./actions";

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function percent(value: number) {
  return `${Math.max(value, 0).toFixed(value > 0 && value < 10 ? 1 : 0)}%`;
}

export default async function CreditCardsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const today = manilaToday();

  const [{ data: cards }, { data: activity }] = await Promise.all([
    supabase.from("credit_cards").select("id,name,issuer,last4,credit_limit,opening_balance,statement_day,due_days_after_statement,is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("credit_card_transactions").select("credit_card_id,activity_type,activity_date,amount").lte("activity_date", today),
  ]);

  const activityRows = activity ?? [];
  const rows = (cards ?? []).map((card) => {
    const cardActivity = activityRows.filter((row) => row.credit_card_id === card.id);
    const balance = creditCardBalance(card, cardActivity, today);
    const available = availableCredit(card, balance);
    const utilization = utilizationRate(card, balance);
    const statementMonth = defaultStatementMonth(today, Number(card.statement_day), Number(card.due_days_after_statement));
    const cycle = statementPeriodForMonth(statementMonth, Number(card.statement_day), Number(card.due_days_after_statement));
    return { ...card, balance, available, utilization, cycle };
  });

  const activeRows = rows.filter((row) => row.is_active);
  const totalOutstanding = activeRows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
  const totalLimit = activeRows.reduce((sum, row) => sum + Number(row.credit_limit), 0);
  const totalAvailable = activeRows.reduce((sum, row) => sum + row.available, 0);

  return (
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">Borrowing</div><h2>Credit Cards</h2><p>Track card purchases, payments, installments, statement cycles, and outstanding balances.</p></div>
      </div>

      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards credit-card-stats">
        <div className="stat-card"><div className="stat-label">Outstanding balance</div><div className={`stat-value ${totalOutstanding > 0 ? "negative" : "positive"}`}>{money(totalOutstanding)}</div><div className="stat-foot">Across active cards</div></div>
        <div className="stat-card"><div className="stat-label">Available credit</div><div className="stat-value positive">{money(totalAvailable)}</div><div className="stat-foot">From {money(totalLimit)} total limit</div></div>
        <div className="stat-card"><div className="stat-label">Active cards</div><div className="stat-value">{activeRows.length}</div><div className="stat-foot">Managed in MyMoney</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Utilization</div><div className="stat-value">{totalLimit > 0 ? percent((totalOutstanding / totalLimit) * 100) : "0%"}</div><div className="stat-foot">Outstanding ÷ total limit</div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Add credit card</h3><p className="muted">Use the statement day shown by your bank. MyMoney limits it to day 1–28 for predictable billing cycles.</p></div></div>
        <form action={createCreditCard} className="form-grid compact-form">
          <div className="field"><label htmlFor="cc_name">Card name</label><input id="cc_name" name="name" placeholder="e.g. BDO Visa" required /></div>
          <div className="field"><label htmlFor="cc_issuer">Issuer <span className="muted">(optional)</span></label><input id="cc_issuer" name="issuer" placeholder="e.g. BDO" /></div>
          <div className="field"><label htmlFor="cc_last4">Last 4 digits <span className="muted">(optional)</span></label><input id="cc_last4" name="last4" inputMode="numeric" maxLength={4} placeholder="1234" /></div>
          <div className="field"><label htmlFor="cc_limit">Credit limit</label><input id="cc_limit" name="credit_limit" type="number" min="0" step="0.01" defaultValue="0" required /></div>
          <div className="field"><label htmlFor="cc_opening">Opening balance</label><input id="cc_opening" name="opening_balance" type="number" min="0" step="0.01" defaultValue="0" /></div>
          <div className="field"><label htmlFor="cc_statement_day">Statement day</label><input id="cc_statement_day" name="statement_day" type="number" min="1" max="28" defaultValue="25" required /></div>
          <div className="field"><label htmlFor="cc_due_days">Days from statement to due</label><input id="cc_due_days" name="due_days_after_statement" type="number" min="1" max="45" defaultValue="20" required /></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Add card</button></div>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Your cards</h3><p className="muted">Card balances increase when you charge expenses and decrease when you record payments or refunds.</p></div><strong>{rows.length} cards</strong></div>
        {rows.length === 0 ? <div className="empty">No credit cards yet.</div> : (
          <div className="credit-card-grid">
            {rows.map((card) => (
              <Link className="credit-card-tile" href={`/credit-cards/${card.id}`} key={card.id}>
                <div className="goal-meta"><div><strong>{card.name}</strong><div className="muted card-subline">{card.issuer || "Credit card"}{card.last4 ? ` · •••• ${card.last4}` : ""}</div></div><span className={`status-badge ${card.is_active ? "status-active" : "status-muted"}`}>{card.is_active ? "Active" : "Inactive"}</span></div>
                <div className="credit-card-balance"><span>Outstanding</span><strong className={card.balance > 0 ? "negative" : "positive"}>{money(Math.max(card.balance, 0))}</strong></div>
                <div className="progress-track"><div className={`progress-bar ${card.utilization >= 80 ? "progress-danger" : card.utilization >= 50 ? "progress-warning" : ""}`} style={{ width: `${Math.min(card.utilization, 100)}%` }} /></div>
                <div className="card-meta-row"><span>{percent(card.utilization)} used</span><span>{money(card.available)} available</span></div>
                <div className="card-meta-row"><span>Statement {card.cycle.end}</span><span>Due {card.cycle.dueDate}</span></div>
                <div className="account-card-footer">Open card center →</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
