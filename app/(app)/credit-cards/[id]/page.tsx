import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import {
  availableCredit,
  creditCardBalance,
  creditCardImpact,
  defaultStatementMonth,
  monthLabel,
  shiftMonth,
  statementPeriodForMonth,
  utilizationRate,
} from "@/lib/credit-cards";
import { CreditCardEntryForm } from "@/components/credit-card-entry-form";
import { cancelFutureInstallments, createInstallmentPlan, deleteCreditCard, deleteCreditCardActivity, updateCreditCard, updateInstallmentClassification } from "../actions";

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function pct(value: number) {
  return `${Math.max(value, 0).toFixed(value > 0 && value < 10 ? 1 : 0)}%`;
}

function activityLabel(type: string) {
  if (type === "purchase") return "Purchase";
  if (type === "payment") return "Payment";
  if (type === "refund") return "Refund";
  if (type === "fee") return "Fee";
  return "Interest";
}

export default async function CreditCardDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statement?: string; error?: string; success?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const today = manilaToday();

  const [
    { data: card },
    { data: activity },
    { data: installments },
    { data: accounts },
    { data: categories },
    { data: owners },
  ] = await Promise.all([
    supabase.from("credit_cards").select("id,name,issuer,last4,credit_limit,opening_balance,statement_day,due_days_after_statement,is_active,created_at").eq("id", id).maybeSingle(),
    supabase.from("credit_card_transactions").select("id,activity_date,activity_type,account_id,category_id,owner_id,amount,description,need_want,fixed_variable,installment_id,installment_sequence,installment_total,notes,created_at").eq("credit_card_id", id).order("activity_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("credit_card_installments").select("id,purchase_date,first_charge_date,description,total_amount,term_months,status,category_id,owner_id,created_at").eq("credit_card_id", id).order("first_charge_date", { ascending: false }),
    supabase.from("accounts").select("id,name,is_active").eq("is_active", true).order("name"),
    supabase.from("categories").select("id,name").eq("category_type", "expense").eq("is_active", true).order("name"),
    supabase.from("owners").select("id,name,is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
  ]);

  if (!card) notFound();
  const allActivity = activity ?? [];
  const postedActivity = allActivity.filter((row) => row.activity_date <= today);
  const upcomingActivity = allActivity.filter((row) => row.activity_date > today);
  const balance = creditCardBalance(card, postedActivity, today);
  const available = availableCredit(card, balance);
  const utilization = utilizationRate(card, balance);

  const defaultMonth = defaultStatementMonth(today, Number(card.statement_day), Number(card.due_days_after_statement));
  const statementMonth = query.statement && /^\d{4}-\d{2}$/.test(query.statement) ? query.statement : defaultMonth;
  const cycle = statementPeriodForMonth(statementMonth, Number(card.statement_day), Number(card.due_days_after_statement));
  const statementAsOf = cycle.end < today ? cycle.end : today;
  const statementRows = postedActivity
    .filter((row) => row.activity_date >= cycle.start && row.activity_date <= statementAsOf)
    .sort((a, b) => `${b.activity_date} ${b.created_at}`.localeCompare(`${a.activity_date} ${a.created_at}`));
  const statementBalance = creditCardBalance(card, postedActivity, statementAsOf);
  const statementCharges = statementRows.filter((row) => ["purchase", "fee", "interest"].includes(row.activity_type)).reduce((sum, row) => sum + Number(row.amount), 0);
  const statementCredits = statementRows.filter((row) => ["payment", "refund"].includes(row.activity_type)).reduce((sum, row) => sum + Number(row.amount), 0);
  const cycleClosed = cycle.end <= today;

  const accountMap = new Map((accounts ?? []).map((row) => [row.id, row.name]));
  const categoryMap = new Map((categories ?? []).map((row) => [row.id, row.name]));
  const ownerMap = new Map((owners ?? []).map((row) => [row.id, row.name]));
  const preferredInstallmentCategory = (categories ?? []).find((row) => row.name.toLowerCase() === "shopping") ?? (categories ?? []).find((row) => row.name.toLowerCase() !== "credit card fees") ?? (categories ?? [])[0];
  const installmentRows = installments ?? [];
  const scheduleByPlan = new Map<string, typeof allActivity>();
  for (const row of allActivity) {
    if (!row.installment_id) continue;
    const list = scheduleByPlan.get(row.installment_id) ?? [];
    list.push(row);
    scheduleByPlan.set(row.installment_id, list);
  }
  const hasHistory = allActivity.length > 0 || installmentRows.length > 0;

  return (
    <main className="main">
      <div className="page-heading">
        <div><Link href="/credit-cards" className="back-link">← Credit Cards</Link><div className="eyebrow">Card center</div><h2>{card.name}</h2><p>{card.issuer || "Credit card"}{card.last4 ? ` · •••• ${card.last4}` : ""} · {card.is_active ? "Active" : "Inactive"}</p></div>
        <div className="heading-actions"><Link className="secondary-btn" href="/reports">Reports</Link><Link className="primary-btn" href="#add-card-activity">+ Card activity</Link></div>
      </div>

      {query.error && <div className="notice error page-notice">{query.error}</div>}
      {query.success && <div className="notice success page-notice">{query.success}</div>}

      <section className="cards credit-card-stats">
        <div className="stat-card"><div className="stat-label">Outstanding</div><div className={`stat-value ${balance > 0 ? "negative" : "positive"}`}>{money(Math.max(balance, 0))}</div><div className="stat-foot">As of {today}</div></div>
        <div className="stat-card"><div className="stat-label">Available credit</div><div className="stat-value positive">{money(available)}</div><div className="stat-foot">Limit {money(Number(card.credit_limit))}</div></div>
        <div className="stat-card"><div className="stat-label">Utilization</div><div className="stat-value">{pct(utilization)}</div><div className="stat-foot">Outstanding ÷ limit</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Next due</div><div className="detail-value">{cycle.dueDate}</div><div className="stat-foot">Statement closes {cycle.end}</div></div>
      </section>

      <section className="grid-2 credit-card-main-grid">
        <div className="panel statement-panel">
          <div className="section-heading">
            <div><h3>SOA / Billing cycle</h3><p className="muted">Statement periods run from the day after the prior statement date through this statement date.</p></div>
            <form method="get" className="statement-picker"><label className="sr-only" htmlFor="statement">Statement month</label><input id="statement" type="month" name="statement" defaultValue={statementMonth} /><button className="secondary-btn compact-btn" type="submit">View</button></form>
          </div>
          <div className="cc-cycle-summary">
            <div className="cc-cycle-item"><span>Statement</span><strong>{monthLabel(statementMonth)}</strong></div>
            <div className="cc-cycle-item"><span>Billing period</span><strong>{cycle.start}<br />→ {cycle.end}</strong></div>
            <div className="cc-cycle-item"><span>Due date</span><strong>{cycle.dueDate}</strong></div>
            <div className="cc-cycle-item cc-cycle-balance"><span>{cycleClosed ? "Statement balance" : "Current cycle balance"}</span><strong className={statementBalance > 0 ? "negative" : "positive"}>{money(Math.max(statementBalance, 0))}</strong></div>
          </div>
          <div className="split-metrics statement-splits">
            <div className="split-metric"><span>New charges</span><strong>{money(statementCharges)}</strong><small>Purchases, fees, interest</small></div>
            <div className="split-metric"><span>Payments / refunds</span><strong className="positive">{money(statementCredits)}</strong><small>Credits in this cycle</small></div>
            <div className="split-metric"><span>Status</span><strong>{cycleClosed ? "Closed" : "Open"}</strong><small>As of {statementAsOf}</small></div>
          </div>
          {statementRows.length === 0 ? <div className="empty compact-empty">No posted card activity in this statement period.</div> : (
            <div className="table-wrap statement-table"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead><tbody>{statementRows.map((row) => {
              const impact = creditCardImpact(row.activity_type, row.amount);
              return <tr key={row.id}><td>{row.activity_date}</td><td>{row.description || activityLabel(row.activity_type)}{row.installment_id ? ` · ${row.installment_sequence}/${row.installment_total}` : ""}</td><td><span className={`cc-activity-badge cc-${row.activity_type}`}>{activityLabel(row.activity_type)}</span></td><td className={`${impact < 0 ? "positive" : "negative"} amount-cell`}>{impact < 0 ? "−" : "+"}{money(Math.abs(impact))}</td></tr>;
            })}</tbody></table></div>
          )}
        </div>

        <div className="panel" id="add-card-activity">
          <div className="section-heading"><div><h3>Add card activity</h3><p className="muted">Purchases count as expenses when charged. Payments reduce your card and the selected bank/cash account, but do not count as a new expense.</p></div></div>
          <CreditCardEntryForm cardId={card.id} today={today} accounts={(accounts ?? []).map(({ id: accountId, name }) => ({ id: accountId, name }))} categories={categories ?? []} owners={owners ?? []} />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Installments</h3><p className="muted">Set the purchase date separately from the first billing date. MyMoney generates the monthly charges automatically.</p></div><strong>{installmentRows.length} plans</strong></div>
        <form action={createInstallmentPlan} className="installment-form">
          <input type="hidden" name="credit_card_id" value={card.id} />
          <div className="form-grid">
            <div className="field"><label htmlFor="installment_description">Description</label><input id="installment_description" name="description" placeholder="e.g. Laptop installment" required /></div>
            <div className="field"><label htmlFor="installment_total">Total amount</label><input id="installment_total" name="total_amount" type="number" min="0.01" step="0.01" required /></div>
            <div className="field"><label htmlFor="installment_term">Term (months)</label><input id="installment_term" name="term_months" type="number" min="2" max="60" defaultValue="12" required /></div>
            <div className="field"><label htmlFor="purchase_date">Purchase date</label><input id="purchase_date" name="purchase_date" type="date" defaultValue={today} required /></div>
            <div className="field"><label htmlFor="first_charge_date">First billing date</label><input id="first_charge_date" name="first_charge_date" type="date" defaultValue={today} required /></div>
            <div className="field"><label htmlFor="installment_category">Category</label><select id="installment_category" name="category_id" defaultValue={preferredInstallmentCategory?.id ?? ""} required><option value="" disabled>Select category</option>{(categories ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <div className="field"><label htmlFor="installment_owner">Owner / Charge to</label><select id="installment_owner" name="owner_id" defaultValue={(owners ?? []).find((row) => row.is_default)?.id ?? (owners ?? [])[0]?.id ?? ""}><option value="">No owner</option>{(owners ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <div className="field"><label htmlFor="installment_need">Need or Want</label><select id="installment_need" name="need_want" defaultValue="need"><option value="need">Need</option><option value="want">Want</option></select></div>
            <div className="field"><label htmlFor="installment_fixed">Expense type</label><select id="installment_fixed" name="fixed_variable" defaultValue="fixed"><option value="fixed">Fixed</option><option value="variable">Variable</option></select></div>
          </div>
          <div className="field"><label htmlFor="installment_notes">Notes <span className="muted">(optional)</span></label><textarea id="installment_notes" name="notes" rows={2} /></div>
          <div className="form-actions"><button className="primary-btn" type="submit">Create installment schedule</button></div>
        </form>

        {installmentRows.length > 0 && <div className="installment-list">{installmentRows.map((plan) => {
          const schedule = (scheduleByPlan.get(plan.id) ?? []).sort((a, b) => a.activity_date.localeCompare(b.activity_date));
          const postedCount = schedule.filter((row) => row.activity_date <= today).length;
          const upcoming = schedule.find((row) => row.activity_date > today);
          const scheduledTotal = schedule.reduce((sum, row) => sum + Number(row.amount), 0);
          const displayStatus = plan.status === "active" && postedCount >= plan.term_months && !upcoming ? "completed" : plan.status;
          return <article className="installment-card cc-installment-card" key={plan.id}>
            <div className="cc-installment-head">
              <div><strong className="cc-installment-title">{plan.description}</strong><div className="muted cc-installment-dates">Purchased {plan.purchase_date} · First billed {plan.first_charge_date}</div></div>
              <span className={`status-badge ${displayStatus === "active" ? "status-active" : "status-muted"}`}>{displayStatus}</span>
            </div>
            <div className="cc-installment-summary">
              <div><span>Total</span><strong>{money(Number(plan.total_amount))}</strong></div>
              <div><span>Term</span><strong>{plan.term_months} months</strong></div>
              <div><span>Posted</span><strong>{postedCount} / {plan.term_months}</strong></div>
              <div><span>Next charge</span><strong>{upcoming ? <><span>{upcoming.activity_date}</span><span>{money(Number(upcoming.amount))}</span></> : "None"}</strong></div>
            </div>
            <div className="progress-track"><div className="progress-bar" style={{ width: `${Math.min((postedCount / plan.term_months) * 100, 100)}%` }} /></div>
            <div className="cc-installment-meta">
              <span><b>Scheduled:</b> {money(scheduledTotal)}</span>
              <span><b>Category:</b> {categoryMap.get(plan.category_id ?? "") ?? "Uncategorized"}</span>
              <span><b>Owner:</b> {ownerMap.get(plan.owner_id ?? "") ?? "No owner"}</span>
            </div>
            <details className="cc-installment-edit">
              <summary>Edit category & classification</summary>
              <form action={updateInstallmentClassification} className="cc-installment-edit-form">
                <input type="hidden" name="credit_card_id" value={card.id} />
                <input type="hidden" name="installment_id" value={plan.id} />
                <div className="field"><label htmlFor={`plan_category_${plan.id}`}>Category</label><select id={`plan_category_${plan.id}`} name="category_id" defaultValue={plan.category_id ?? preferredInstallmentCategory?.id ?? ""} required>{(categories ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                <div className="field"><label htmlFor={`plan_owner_${plan.id}`}>Owner / Charge to</label><select id={`plan_owner_${plan.id}`} name="owner_id" defaultValue={plan.owner_id ?? ""}><option value="">No owner</option>{(owners ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                <div className="field"><label htmlFor={`plan_need_${plan.id}`}>Need or Want</label><select id={`plan_need_${plan.id}`} name="need_want" defaultValue={schedule[0]?.need_want ?? "need"}><option value="need">Need</option><option value="want">Want</option></select></div>
                <div className="field"><label htmlFor={`plan_fixed_${plan.id}`}>Expense type</label><select id={`plan_fixed_${plan.id}`} name="fixed_variable" defaultValue={schedule[0]?.fixed_variable ?? "fixed"}><option value="fixed">Fixed</option><option value="variable">Variable</option></select></div>
                <button className="secondary-btn compact-btn" type="submit">Save plan details</button>
              </form>
            </details>
            {displayStatus === "active" && upcoming && <form action={cancelFutureInstallments} className="cc-installment-actions"><input type="hidden" name="credit_card_id" value={card.id} /><input type="hidden" name="installment_id" value={plan.id} /><input type="hidden" name="today" value={today} /><button className="text-btn danger-text" type="submit">Cancel future charges</button></form>}
          </article>;
        })}</div>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Card activity</h3><p className="muted">Posted activity is included in your balance. Future installment charges are shown separately as scheduled.</p></div><strong>{postedActivity.length} posted</strong></div>
        {postedActivity.length === 0 ? <div className="empty">No posted card activity yet.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Category / Account</th><th>Owner</th><th>Amount</th><th></th></tr></thead><tbody>{postedActivity.map((row) => {
          const impact = creditCardImpact(row.activity_type, row.amount);
          const secondary = row.activity_type === "payment" ? accountMap.get(row.account_id ?? "") ?? "Payment account" : categoryMap.get(row.category_id ?? "") ?? "—";
          return <tr key={row.id}><td>{row.activity_date}</td><td>{row.description || activityLabel(row.activity_type)}</td><td><span className={`cc-activity-badge cc-${row.activity_type}`}>{activityLabel(row.activity_type)}</span></td><td>{secondary}</td><td>{row.owner_id ? ownerMap.get(row.owner_id) ?? "—" : "—"}</td><td className={`${impact < 0 ? "positive" : "negative"} amount-cell`}>{impact < 0 ? "−" : "+"}{money(Math.abs(impact))}</td><td>{!row.installment_id && <form action={deleteCreditCardActivity}><input type="hidden" name="credit_card_id" value={card.id} /><input type="hidden" name="id" value={row.id} /><button className="icon-btn danger-icon-btn" title="Delete activity" type="submit">×</button></form>}</td></tr>;
        })}</tbody></table></div>}

        {upcomingActivity.length > 0 && <div className="upcoming-card-activity"><h4>Upcoming installment charges</h4><div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Installment</th><th>Amount</th></tr></thead><tbody>{upcomingActivity.slice(0, 24).map((row) => <tr key={row.id}><td>{row.activity_date}</td><td>{row.description || "Installment"}</td><td>{row.installment_sequence}/{row.installment_total}</td><td className="amount-cell">{money(Number(row.amount))}</td></tr>)}</tbody></table></div></div>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Card settings</h3><p className="muted">Statement day is limited to 1–28 so every month has a valid cycle date.</p></div></div>
        <form action={updateCreditCard} className="form-grid compact-form">
          <input type="hidden" name="id" value={card.id} />
          <div className="field"><label htmlFor="edit_cc_name">Card name</label><input id="edit_cc_name" name="name" defaultValue={card.name} required /></div>
          <div className="field"><label htmlFor="edit_cc_issuer">Issuer</label><input id="edit_cc_issuer" name="issuer" defaultValue={card.issuer ?? ""} /></div>
          <div className="field"><label htmlFor="edit_cc_last4">Last 4 digits</label><input id="edit_cc_last4" name="last4" maxLength={4} defaultValue={card.last4 ?? ""} /></div>
          <div className="field"><label htmlFor="edit_cc_limit">Credit limit</label><input id="edit_cc_limit" name="credit_limit" type="number" min="0" step="0.01" defaultValue={Number(card.credit_limit)} required /></div>
          <div className="field"><label htmlFor="edit_cc_opening">Opening balance</label><input id="edit_cc_opening" name="opening_balance" type="number" min="0" step="0.01" defaultValue={Number(card.opening_balance)} /></div>
          <div className="field"><label htmlFor="edit_cc_statement">Statement day</label><input id="edit_cc_statement" name="statement_day" type="number" min="1" max="28" defaultValue={card.statement_day} required /></div>
          <div className="field"><label htmlFor="edit_cc_due">Days until due</label><input id="edit_cc_due" name="due_days_after_statement" type="number" min="1" max="45" defaultValue={card.due_days_after_statement} required /></div>
          <div className="field"><label htmlFor="edit_cc_active">Status</label><select id="edit_cc_active" name="is_active" defaultValue={card.is_active ? "true" : "false"}><option value="true">Active</option><option value="false">Inactive</option></select></div>
          <div className="filter-actions"><button className="primary-btn" type="submit">Save card</button></div>
        </form>
      </section>

      <section className="danger-zone">
        <div><strong>Delete credit card</strong><p>{hasHistory ? "This card has activity or installment history. Mark it Inactive instead." : "This card has no history and can be deleted."}</p></div>
        <form action={deleteCreditCard}><input type="hidden" name="id" value={card.id} /><button className="danger-btn" type="submit" disabled={hasHistory}>Delete</button></form>
      </section>
    </main>
  );
}
