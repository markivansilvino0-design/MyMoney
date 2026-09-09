"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { recordLoanPayment } from "@/app/(app)/loans/actions";

type Schedule = { id: string; installment_no: number; due_date: string; principalRemaining: number; interestRemaining: number };
type Account = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  return <button className="primary-btn" type="submit" disabled={pending}>{pending ? "Saving..." : "Record payment"}</button>;
}

export function LoanPaymentForm({ loanId, schedules, accounts, today }: { loanId: string; schedules: Schedule[]; accounts: Account[]; today: string }) {
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? "");
  const selected = useMemo(() => schedules.find((row) => row.id === scheduleId), [scheduleId, schedules]);
  return (
    <form action={recordLoanPayment} className="form-grid loan-payment-form">
      <input type="hidden" name="loan_id" value={loanId} />
      <div className="field span-2"><label htmlFor="schedule_id">Apply to scheduled payment</label><select id="schedule_id" name="schedule_id" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Unscheduled / extra payment</option>{schedules.map((row) => <option key={row.id} value={row.id}>#{row.installment_no} · {row.due_date}</option>)}</select></div>
      <div className="field"><label htmlFor="payment_date">Payment date</label><input id="payment_date" name="payment_date" type="date" defaultValue={today} required /></div>
      <div className="field"><label htmlFor="account_id">Account</label><select id="account_id" name="account_id" required><option value="">Choose account</option>{accounts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      <div className="field"><label htmlFor="principal_amount">Principal</label><input key={`p-${scheduleId}`} id="principal_amount" name="principal_amount" type="number" step="0.01" min="0" defaultValue={selected?.principalRemaining ?? 0} /></div>
      <div className="field"><label htmlFor="interest_amount">Interest</label><input key={`i-${scheduleId}`} id="interest_amount" name="interest_amount" type="number" step="0.01" min="0" defaultValue={selected?.interestRemaining ?? 0} /></div>
      <div className="field span-2"><label htmlFor="payment-notes">Notes (optional)</label><input id="payment-notes" name="notes" placeholder="Receipt, reference or note" /></div>
      <div className="filter-actions span-2"><Submit /></div>
    </form>
  );
}
