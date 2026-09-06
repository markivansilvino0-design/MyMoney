"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createCreditCardActivity } from "@/app/(app)/credit-cards/actions";

type Account = { id: string; name: string };
type Category = { id: string; name: string };
type Owner = { id: string; name: string; is_default?: boolean };

type ActivityType = "purchase" | "payment" | "refund" | "fee" | "interest";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="primary-btn" type="submit" disabled={pending}>{pending ? "Saving..." : "Save card activity"}</button>;
}

export function CreditCardEntryForm({
  cardId,
  today,
  accounts,
  categories,
  owners,
}: {
  cardId: string;
  today: string;
  accounts: Account[];
  categories: Category[];
  owners: Owner[];
}) {
  const [type, setType] = useState<ActivityType>("purchase");
  const defaultOwner = owners.find((owner) => owner.is_default)?.id ?? owners[0]?.id ?? "";
  const expenseLike = type === "purchase" || type === "fee" || type === "interest";
  const showClassification = expenseLike;

  return (
    <form action={createCreditCardActivity} className="transaction-form card-entry-form">
      <input type="hidden" name="credit_card_id" value={cardId} />
      <input type="hidden" name="activity_type" value={type} />

      <div className="field type-field">
        <label>Activity type</label>
        <div className="type-tabs card-type-tabs" role="group" aria-label="Credit card activity type">
          {([
            ["purchase", "Purchase", "+"] as const,
            ["payment", "Payment", "✓"] as const,
            ["refund", "Refund", "↩"] as const,
            ["fee", "Fee", "!"] as const,
            ["interest", "Interest", "%"] as const,
          ]).map(([value, label, icon]) => (
            <button key={value} type="button" className={`type-tab ${type === value ? "active" : ""}`} onClick={() => setType(value)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <div className="field"><label htmlFor="cc_activity_date">Date</label><input id="cc_activity_date" name="activity_date" type="date" defaultValue={today} required /></div>
        <div className="field"><label htmlFor="cc_amount">Amount</label><input id="cc_amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></div>

        {type === "payment" ? (
          <div className="field"><label htmlFor="cc_account_id">Pay from account</label><select id="cc_account_id" name="account_id" defaultValue={accounts[0]?.id ?? ""} required><option value="" disabled>Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
        ) : (
          <>
            <div className="field"><label htmlFor="cc_category_id">Category{type === "refund" ? " (optional)" : ""}</label><select id="cc_category_id" name="category_id" defaultValue={categories[0]?.id ?? ""} required={type !== "refund"}><option value="">{type === "refund" ? "No category" : "Select category"}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="field"><label htmlFor="cc_owner_id">Owner / Charge to</label><select id="cc_owner_id" name="owner_id" defaultValue={defaultOwner}><option value="">No owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></div>
          </>
        )}

        {showClassification && (
          <>
            <div className="field"><label htmlFor="cc_need_want">Need or Want</label><select id="cc_need_want" name="need_want" defaultValue="need"><option value="need">Need</option><option value="want">Want</option></select></div>
            <div className="field"><label htmlFor="cc_fixed_variable">Expense type</label><select id="cc_fixed_variable" name="fixed_variable" defaultValue="variable"><option value="fixed">Fixed</option><option value="variable">Variable</option></select></div>
          </>
        )}
      </div>

      <div className="field"><label htmlFor="cc_description">Description <span className="muted">(optional)</span></label><input id="cc_description" name="description" placeholder={type === "payment" ? "e.g. September card payment" : type === "refund" ? "e.g. Store refund" : "e.g. Groceries, Utility bill"} /></div>
      <div className="field"><label htmlFor="cc_notes">Notes <span className="muted">(optional)</span></label><textarea id="cc_notes" name="notes" rows={2} /></div>

      {type === "payment" && accounts.length === 0 && <div className="notice error">Add a cash, bank, or e-wallet account before recording a card payment.</div>}
      <div className="form-actions"><SubmitButton /></div>
    </form>
  );
}
