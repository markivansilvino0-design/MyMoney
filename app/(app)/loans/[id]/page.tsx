import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { loanOutstanding } from "@/lib/loans";
import { LoanPaymentForm } from "@/components/loan-payment-form";
import { deleteLoan, deleteLoanPayment, updateLoan } from "../actions";

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function LoanDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const notices = await searchParams;
  const supabase = await createClient();
  const today = manilaToday();

  const [{ data: loan }, { data: schedule }, { data: payments }, { data: accounts }] = await Promise.all([
    supabase.from("loans").select("id,loan_type,name,counterparty,principal_amount,annual_interest_rate,term_months,start_date,first_due_date,funding_account_id,record_initial_cash,status,notes,created_at").eq("id", id).maybeSingle(),
    supabase.from("loan_schedule").select("id,installment_no,due_date,principal_due,interest_due,status").eq("loan_id", id).order("installment_no"),
    supabase.from("loan_payments").select("id,schedule_id,payment_date,account_id,principal_amount,interest_amount,notes,created_at").eq("loan_id", id).order("payment_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("accounts").select("id,name").eq("is_active", true).order("name"),
  ]);
  if (!loan) notFound();

  const paymentRows = payments ?? [];
  const outstanding = loanOutstanding(loan.principal_amount, paymentRows);
  const paidPrincipal = paymentRows.reduce((sum, row) => sum + Number(row.principal_amount), 0);
  const paidInterest = paymentRows.reduce((sum, row) => sum + Number(row.interest_amount), 0);
  const accountMap = new Map((accounts ?? []).map((row) => [row.id, row.name]));
  const paidBySchedule = new Map<string, { principal: number; interest: number }>();
  for (const payment of paymentRows) {
    if (!payment.schedule_id) continue;
    const bucket = paidBySchedule.get(payment.schedule_id) ?? { principal: 0, interest: 0 };
    bucket.principal += Number(payment.principal_amount);
    bucket.interest += Number(payment.interest_amount);
    paidBySchedule.set(payment.schedule_id, bucket);
  }

  const scheduleRows = (schedule ?? []).map((row) => {
    const paid = paidBySchedule.get(row.id) ?? { principal: 0, interest: 0 };
    const principalRemaining = Math.max(Number(row.principal_due) - paid.principal, 0);
    const interestRemaining = Math.max(Number(row.interest_due) - paid.interest, 0);
    const remaining = principalRemaining + interestRemaining;
    const computedStatus = remaining <= 0.005 ? "paid" : paid.principal + paid.interest > 0 ? "partial" : row.due_date < today ? "overdue" : "scheduled";
    return { ...row, principalRemaining, interestRemaining, remaining, computedStatus };
  });
  const openSchedules = scheduleRows.filter((row) => row.remaining > 0.005);
  const nextDue = openSchedules[0];
  const progress = Number(loan.principal_amount) > 0 ? Math.min((paidPrincipal / Number(loan.principal_amount)) * 100, 100) : 0;

  return (
    <main className="main">
      <div className="page-heading"><div><Link href="/loans" className="back-link">← Loans & Receivables</Link><div className="eyebrow">{loan.loan_type === "borrowed" ? "Debt" : "Receivable"}</div><h2>{loan.name}</h2><p>{loan.counterparty || "No counterparty"} · {loan.status}</p></div></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards loan-detail-stats">
        <div className="stat-card"><div className="stat-label">Outstanding principal</div><div className={`stat-value ${loan.loan_type === "borrowed" ? "negative" : "positive"}`}>{money(outstanding)}</div><div className="stat-foot">{progress.toFixed(progress < 10 && progress > 0 ? 1 : 0)}% repaid</div></div>
        <div className="stat-card"><div className="stat-label">Principal repaid</div><div className="stat-value positive">{money(paidPrincipal)}</div><div className="stat-foot">Original {money(Number(loan.principal_amount))}</div></div>
        <div className="stat-card"><div className="stat-label">Interest {loan.loan_type === "borrowed" ? "paid" : "received"}</div><div className={`stat-value ${loan.loan_type === "borrowed" ? "negative" : "positive"}`}>{money(paidInterest)}</div><div className="stat-foot">Rate {Number(loan.annual_interest_rate).toFixed(2)}% p.a.</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Next due</div><div className="stat-value loan-next-date">{nextDue?.due_date ?? "—"}</div><div className="stat-foot">{nextDue ? money(nextDue.remaining) : "No amount due"}</div></div>
      </section>

      <section className="grid-2 loan-detail-grid">
        <div className="panel"><div className="section-heading"><div><h3>Record {loan.loan_type === "borrowed" ? "repayment" : "collection"}</h3><p className="muted">Principal changes the loan balance; interest is the only portion counted as {loan.loan_type === "borrowed" ? "an expense" : "income"}.</p></div></div><LoanPaymentForm loanId={loan.id} schedules={openSchedules.map((row) => ({ id: row.id, installment_no: row.installment_no, due_date: row.due_date, principalRemaining: row.principalRemaining, interestRemaining: row.interestRemaining }))} accounts={accounts ?? []} today={today} /></div>
        <div className="panel loan-info-panel"><div className="section-heading"><div><h3>Loan details</h3><p className="muted">The repayment schedule is locked to the original principal, rate and term.</p></div></div><div className="loan-info-grid"><div><span>Type</span><strong>{loan.loan_type === "borrowed" ? "Borrowed / I owe" : "Lent / Owed to me"}</strong></div><div><span>Start</span><strong>{loan.start_date}</strong></div><div><span>Term</span><strong>{loan.term_months} months</strong></div><div><span>First due</span><strong>{loan.first_due_date}</strong></div><div><span>Initial cash</span><strong>{loan.record_initial_cash ? (loan.loan_type === "borrowed" ? "Received into account" : "Paid from account") : "Not recorded"}</strong></div><div><span>Funding account</span><strong>{loan.funding_account_id ? accountMap.get(loan.funding_account_id) ?? "Account" : "—"}</strong></div></div></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}><div className="section-heading"><div><h3>Repayment schedule</h3><p className="muted">Fixed monthly payment schedule using the declining outstanding balance for interest.</p></div><strong>{scheduleRows.length} installments</strong></div><div className="table-wrap"><table className="modern-table"><thead><tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{scheduleRows.map((row) => <tr key={row.id}><td>{row.installment_no}</td><td>{row.due_date}</td><td>{money(Number(row.principal_due))}</td><td>{money(Number(row.interest_due))}</td><td>{money(row.remaining)}</td><td><span className={`status-badge loan-status-${row.computedStatus}`}>{row.computedStatus}</span></td></tr>)}</tbody></table></div></section>

      <section className="panel" style={{ marginTop: 16 }}><div className="section-heading"><div><h3>Payment history</h3><p className="muted">Cash movements are reflected in the selected account automatically.</p></div><strong>{paymentRows.length}</strong></div>{paymentRows.length === 0 ? <div className="empty">No payments recorded yet.</div> : <div className="table-wrap"><table className="modern-table"><thead><tr><th>Date</th><th>Account</th><th>Principal</th><th>Interest</th><th>Total</th><th></th></tr></thead><tbody>{paymentRows.map((row) => <tr key={row.id}><td>{row.payment_date}</td><td>{accountMap.get(row.account_id) ?? "Account"}</td><td>{money(Number(row.principal_amount))}</td><td>{money(Number(row.interest_amount))}</td><td className={loan.loan_type === "borrowed" ? "negative amount-cell" : "positive amount-cell"}>{loan.loan_type === "borrowed" ? "−" : "+"}{money(Number(row.principal_amount) + Number(row.interest_amount))}</td><td><form action={deleteLoanPayment}><input type="hidden" name="loan_id" value={loan.id} /><input type="hidden" name="payment_id" value={row.id} /><button className="icon-delete" type="submit" title="Delete payment">×</button></form></td></tr>)}</tbody></table></div>}</section>

      <section className="panel" style={{ marginTop: 16 }}><div className="section-heading"><div><h3>Edit loan</h3><p className="muted">You can rename, update the counterparty, pause or archive the loan.</p></div></div><form action={updateLoan} className="form-grid compact-form"><input type="hidden" name="id" value={loan.id} /><div className="field"><label htmlFor="loan-edit-name">Name</label><input id="loan-edit-name" name="name" defaultValue={loan.name} required /></div><div className="field"><label htmlFor="loan-edit-counterparty">Counterparty</label><input id="loan-edit-counterparty" name="counterparty" defaultValue={loan.counterparty ?? ""} /></div><div className="field"><label htmlFor="loan-status">Status</label><select id="loan-status" name="status" defaultValue={loan.status}><option value="active">Active</option><option value="paused">Paused</option><option value="paid">Paid</option><option value="archived">Archived</option></select></div><div className="field span-2"><label htmlFor="loan-edit-notes">Notes</label><textarea id="loan-edit-notes" name="notes" rows={3} defaultValue={loan.notes ?? ""} /></div><div className="filter-actions"><button className="primary-btn" type="submit">Save loan</button></div></form></section>

      <section className="danger-zone"><div><strong>Delete loan</strong><p>{paymentRows.length > 0 ? "This loan has payment history. Archive it instead." : "Deleting removes the generated schedule and, if recorded, reverses the initial cash movement from account calculations."}</p></div><form action={deleteLoan}><input type="hidden" name="id" value={loan.id} /><button className="danger-btn" type="submit" disabled={paymentRows.length > 0}>Delete</button></form></section>
    </main>
  );
}
