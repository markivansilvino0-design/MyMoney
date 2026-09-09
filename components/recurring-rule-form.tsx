"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createRecurringRule } from "@/app/(app)/recurring/actions";

type Account = { id: string; name: string; account_type: string; is_active?: boolean };
type Category = { id: string; name: string; category_type: "income" | "expense" };
type Owner = { id: string; name: string; is_default: boolean };
type Goal = { id: string; name: string; status?: string };
type Card = { id: string; name: string; issuer?: string | null; last4?: string | null; is_active?: boolean };
type RuleType = "income" | "expense" | "transfer" | "savings" | "card_purchase" | "card_payment";
type SavingMode = "earmark" | "transfer";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="primary-btn" type="submit" disabled={disabled || pending}>{pending ? "Creating..." : "Create recurring item"}</button>;
}

export function RecurringRuleForm({
  accounts,
  categories,
  owners,
  goals,
  cards,
  today,
}: {
  accounts: Account[];
  categories: Category[];
  owners: Owner[];
  goals: Goal[];
  cards: Card[];
  today: string;
}) {
  const [type, setType] = useState<RuleType>("expense");
  const [savingMode, setSavingMode] = useState<SavingMode>("earmark");
  const [savingsEntryType, setSavingsEntryType] = useState<"deposit" | "withdrawal">("deposit");

  const categoryType = type === "income" ? "income" : "expense";
  const filteredCategories = useMemo(() => categories.filter((category) => category.category_type === categoryType), [categories, categoryType]);
  const defaultOwner = owners.find((owner) => owner.is_default)?.id ?? owners[0]?.id ?? "";
  const firstAccount = accounts[0]?.id ?? "";
  const secondAccount = accounts.find((account) => account.id !== firstAccount)?.id ?? "";
  const noAccount = ["income", "expense", "transfer", "savings", "card_payment"].includes(type) && accounts.length === 0;
  const noCard = ["card_purchase", "card_payment"].includes(type) && cards.length === 0;
  const noGoal = type === "savings" && goals.length === 0;
  const needsSecondAccount = type === "transfer" || (type === "savings" && savingMode === "transfer");
  const disabled = noAccount || noCard || noGoal || (needsSecondAccount && accounts.length < 2);

  return (
    <form action={createRecurringRule} className="transaction-form recurring-form">
      <div className="field type-field">
        <label>Recurring type</label>
        <div className="type-tabs recurring-type-tabs">
          {([
            ["income", "Income", "+"],
            ["expense", "Expense", "−"],
            ["transfer", "Transfer", "↔"],
            ["savings", "Savings", "◎"],
            ["card_purchase", "Card charge", "▣"],
            ["card_payment", "Card payment", "✓"],
          ] as const).map(([value, label, icon]) => (
            <button key={value} type="button" className={`type-tab ${type === value ? "active" : ""}`} onClick={() => setType(value)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
        <input type="hidden" name="rule_type" value={type} />
      </div>

      <div className="form-grid recurring-main-grid">
        <div className="field span-2"><label htmlFor="name">Name</label><input id="name" name="name" placeholder="e.g. Monthly salary, Rent, Netflix" required /></div>
        <div className="field"><label htmlFor="amount">Amount</label><input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></div>
        <div className="field"><label htmlFor="frequency">Frequency</label><select id="frequency" name="frequency" defaultValue="monthly"><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
        <div className="field"><label htmlFor="start_date">First due date</label><input id="start_date" name="start_date" type="date" defaultValue={today} required /></div>
        <div className="field"><label htmlFor="end_date">End date <span className="muted">(optional)</span></label><input id="end_date" name="end_date" type="date" /></div>

        {type === "savings" && <>
          <div className="field"><label htmlFor="savings_entry_type">Savings action</label><select id="savings_entry_type" name="savings_entry_type" value={savingsEntryType} onChange={(event) => setSavingsEntryType(event.target.value as "deposit" | "withdrawal")}><option value="deposit">Deposit / add to goal</option><option value="withdrawal">Withdrawal / reduce goal</option></select></div>
          <div className="field"><label htmlFor="saving_mode">Savings method</label><select id="saving_mode" name="saving_mode" value={savingMode} onChange={(event) => setSavingMode(event.target.value as SavingMode)}><option value="earmark">Earmark only</option><option value="transfer">Transfer between accounts</option></select></div>
        </>}

        {["income", "expense", "transfer", "savings", "card_payment"].includes(type) && <div className="field"><label htmlFor="account_id">{type === "income" ? "Deposit to account" : type === "card_payment" ? "Pay card from account" : type === "transfer" ? "From account" : type === "savings" && savingMode === "earmark" ? "Account holding the money" : "Pay from account"}</label><select id="account_id" name="account_id" defaultValue={firstAccount} required><option value="" disabled>Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_active === false ? " (inactive)" : ""}</option>)}</select></div>}

        {needsSecondAccount && <div className="field"><label htmlFor="to_account_id">To account</label><select id="to_account_id" name="to_account_id" defaultValue={secondAccount} required><option value="" disabled>Select destination</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>}

        {["income", "expense", "card_purchase"].includes(type) && <>
          <div className="field"><label htmlFor="category_id">Category</label><select key={type} id="category_id" name="category_id" defaultValue={filteredCategories[0]?.id ?? ""} required><option value="" disabled>Select category</option>{filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
          <div className="field"><label htmlFor="owner_id">Owner / Charge to</label><select id="owner_id" name="owner_id" defaultValue={defaultOwner}><option value="">No owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></div>
        </>}

        {type === "savings" && <div className="field"><label htmlFor="savings_goal_id">Savings goal</label><select id="savings_goal_id" name="savings_goal_id" defaultValue={goals[0]?.id ?? ""} required><option value="" disabled>{goals.length ? "Select goal" : "No active goals"}</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></div>}

        {["card_purchase", "card_payment"].includes(type) && <div className="field"><label htmlFor="credit_card_id">Credit card</label><select id="credit_card_id" name="credit_card_id" defaultValue={cards[0]?.id ?? ""} required><option value="" disabled>{cards.length ? "Select card" : "No active cards"}</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}{card.last4 ? ` •••• ${card.last4}` : ""}</option>)}</select></div>}

        {["expense", "card_purchase"].includes(type) && <>
          <div className="field"><label htmlFor="need_want">Need or Want</label><select id="need_want" name="need_want" defaultValue="need"><option value="need">Need</option><option value="want">Want</option></select></div>
          <div className="field"><label htmlFor="fixed_variable">Expense type</label><select id="fixed_variable" name="fixed_variable" defaultValue="fixed"><option value="fixed">Fixed</option><option value="variable">Variable</option></select></div>
        </>}
      </div>

      <div className="field"><label htmlFor="description">Description <span className="muted">(optional)</span></label><input id="description" name="description" placeholder="What should appear in transaction history?" /></div>
      <div className="field"><label htmlFor="notes">Notes <span className="muted">(optional)</span></label><textarea id="notes" name="notes" placeholder="Any details you want to remember." /></div>

      <label className="recurring-auto-post"><input name="auto_post" type="checkbox" /><span><strong>Auto-post when due</strong><small>With Supabase Cron enabled, MyMoney records this automatically on its due date. Leave off if you prefer a reminder and manual confirmation.</small></span></label>

      {disabled && <div className="notice error">{noAccount ? "Add an account before creating this recurring item." : noCard ? "Add a credit card first." : noGoal ? "Create an active savings goal first." : "Add another account for this transfer."}</div>}
      <div className="form-actions"><SubmitButton disabled={disabled} /></div>
    </form>
  );
}
