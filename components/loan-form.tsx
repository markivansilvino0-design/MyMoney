"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createLoan } from "@/app/(app)/loans/actions";

type Account = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="primary-btn" type="submit" disabled={pending}>{pending ? "Creating..." : "Create loan"}</button>;
}

export function LoanForm({ accounts, today }: { accounts: Account[]; today: string }) {
  const [loanType, setLoanType] = useState<"borrowed" | "lent">("borrowed");
  const [recordCash, setRecordCash] = useState(true);
  return (
    <form action={createLoan} className="loan-create-form">
      <input type="hidden" name="loan_type" value={loanType} />
      <div className="type-tabs loan-type-tabs">
        <button type="button" className={`type-tab ${loanType === "borrowed" ? "selected" : ""}`} onClick={() => setLoanType("borrowed")}>I borrowed</button>
        <button type="button" className={`type-tab ${loanType === "lent" ? "selected" : ""}`} onClick={() => setLoanType("lent")}>I lent money</button>
      </div>
      <div className="form-grid loan-main-grid">
        <div className="field span-2"><label htmlFor="loan-name">Name</label><input id="loan-name" name="name" placeholder={loanType === "borrowed" ? "e.g. Personal loan" : "e.g. Loan to Alex"} required /></div>
        <div className="field"><label htmlFor="counterparty">{loanType === "borrowed" ? "Lender" : "Borrower"}</label><input id="counterparty" name="counterparty" placeholder={loanType === "borrowed" ? "e.g. BPI" : "e.g. Alex"} /></div>
        <div className="field"><label htmlFor="principal_amount">Principal</label><input id="principal_amount" name="principal_amount" type="number" step="0.01" min="0.01" placeholder="0.00" required /></div>
        <div className="field"><label htmlFor="annual_interest_rate">Annual interest %</label><input id="annual_interest_rate" name="annual_interest_rate" type="number" step="0.01" min="0" defaultValue="0" /></div>
        <div className="field"><label htmlFor="term_months">Term (months)</label><input id="term_months" name="term_months" type="number" min="1" max="360" defaultValue="12" required /></div>
        <div className="field"><label htmlFor="start_date">Start date</label><input id="start_date" name="start_date" type="date" defaultValue={today} required /></div>
        <div className="field"><label htmlFor="first_due_date">First payment due</label><input id="first_due_date" name="first_due_date" type="date" defaultValue={today} required /></div>
      </div>
      <label className="loan-cash-toggle"><input type="checkbox" name="record_initial_cash" checked={recordCash} onChange={(event) => setRecordCash(event.target.checked)} /><span><strong>Record the initial cash movement</strong><small>{loanType === "borrowed" ? "Adds the borrowed principal to the selected account." : "Subtracts the amount you lent from the selected account."}</small></span></label>
      {recordCash && <div className="field"><label htmlFor="funding_account_id">{loanType === "borrowed" ? "Receive into account" : "Lend from account"}</label><select id="funding_account_id" name="funding_account_id" required><option value="">Choose account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>}
      <div className="field"><label htmlFor="loan-notes">Notes (optional)</label><textarea id="loan-notes" name="notes" rows={3} placeholder="Reference number, agreement details, purpose..." /></div>
      <div className="form-actions"><SubmitButton /></div>
    </form>
  );
}
