import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { LoanForm } from "@/components/loan-form";

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const today = manilaToday();

  const [{ data: loans }, { data: payments }, { data: schedule }, { data: accounts }] = await Promise.all([
    supabase.from("loans").select("id,loan_type,name,counterparty,principal_amount,annual_interest_rate,term_months,start_date,status,created_at").neq("status", "archived").order("created_at", { ascending: false }),
    supabase.from("loan_payments").select("loan_id,principal_amount,interest_amount"),
    supabase.from("loan_schedule").select("id,loan_id,due_date,principal_due,interest_due,status").neq("status", "paid").order("due_date"),
    supabase.from("accounts").select("id,name").eq("is_active", true).order("name"),
  ]);

  const paidByLoan = new Map<string, number>();
  for (const payment of payments ?? []) paidByLoan.set(payment.loan_id, (paidByLoan.get(payment.loan_id) ?? 0) + Number(payment.principal_amount));
  const nextDueByLoan = new Map<string, { due_date: string; amount: number }>();
  for (const row of schedule ?? []) if (!nextDueByLoan.has(row.loan_id)) nextDueByLoan.set(row.loan_id, { due_date: row.due_date, amount: Number(row.principal_due) + Number(row.interest_due) });

  const rows = (loans ?? []).map((loan) => {
    const principal = Number(loan.principal_amount);
    const paid = paidByLoan.get(loan.id) ?? 0;
    return { ...loan, principal, paid, outstanding: Math.max(principal - paid, 0), nextDue: nextDueByLoan.get(loan.id) };
  });
  const iOwe = rows.filter((row) => row.loan_type === "borrowed" && row.status !== "paid").reduce((sum, row) => sum + row.outstanding, 0);
  const owedToMe = rows.filter((row) => row.loan_type === "lent" && row.status !== "paid").reduce((sum, row) => sum + row.outstanding, 0);
  const dueSoon = (schedule ?? []).filter((row) => row.due_date >= today && row.due_date <= addDays(today, 30)).length;

  return (
    <main className="main">
      <div className="page-heading"><div><div className="eyebrow">Borrow & lend</div><h2>Loans & Receivables</h2><p>Track money you owe, money owed to you, repayment schedules, and interest.</p></div></div>
      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards loan-stats">
        <div className="stat-card"><div className="stat-label">I owe</div><div className="stat-value negative">{money(iOwe)}</div><div className="stat-foot">Outstanding borrowed principal</div></div>
        <div className="stat-card"><div className="stat-label">Owed to me</div><div className="stat-value positive">{money(owedToMe)}</div><div className="stat-foot">Outstanding receivables</div></div>
        <div className="stat-card"><div className="stat-label">Net position</div><div className={`stat-value ${owedToMe - iOwe < 0 ? "negative" : "positive"}`}>{money(owedToMe - iOwe)}</div><div className="stat-foot">Receivables − debts</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Due next 30 days</div><div className="stat-value">{dueSoon}</div><div className="stat-foot">Scheduled installments</div></div>
      </section>

      <section className="grid-2 loan-create-layout">
        <div className="panel"><div className="section-heading"><div><h3>Add loan or receivable</h3><p className="muted">Principal movements do not count as income or expenses. Only interest affects reports.</p></div></div><LoanForm accounts={accounts ?? []} today={today} /></div>
        <div className="panel loan-list-panel"><div className="section-heading"><div><h3>Your loans</h3><p className="muted">Open any loan to record payments and review its schedule.</p></div><strong>{rows.length}</strong></div>
          {rows.length === 0 ? <div className="empty">No loans or receivables yet.</div> : <div className="loan-card-list">{rows.map((loan) => {
            const pct = loan.principal > 0 ? Math.min((loan.paid / loan.principal) * 100, 100) : 0;
            return <Link href={`/loans/${loan.id}`} className="loan-card" key={loan.id}>
              <div className="loan-card-head"><div><strong>{loan.name}</strong><span>{loan.counterparty || (loan.loan_type === "borrowed" ? "Lender not specified" : "Borrower not specified")}</span></div><span className={`status-badge ${loan.loan_type === "borrowed" ? "loan-borrowed" : "loan-lent"}`}>{loan.loan_type === "borrowed" ? "Borrowed" : "Lent"}</span></div>
              <div className="loan-card-balance"><span>Outstanding</span><strong className={loan.loan_type === "borrowed" ? "negative" : "positive"}>{money(loan.outstanding)}</strong></div>
              <div className="progress-track"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
              <div className="loan-card-meta"><span>{pct.toFixed(pct < 10 && pct > 0 ? 1 : 0)}% principal repaid</span><span>{loan.nextDue ? `Next ${loan.nextDue.due_date} · ${money(loan.nextDue.amount)}` : loan.status === "paid" ? "Paid" : "No upcoming due"}</span></div>
            </Link>;
          })}</div>}
        </div>
      </section>
    </main>
  );
}
