"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createMoneyEntry, updateMoneyEntry } from "@/app/(app)/transactions/actions";

type Account = { id: string; name: string; account_type: string; is_active?: boolean };
type Category = { id: string; name: string; category_type: "income" | "expense" };
type Owner = { id: string; name: string; is_default: boolean };
type Goal = { id: string; name: string; target_amount: number; current_amount: number; status?: string };
type EntryType = "income" | "expense" | "transfer" | "savings";
type SavingsEntryType = "deposit" | "withdrawal";
type SavingMode = "earmark" | "transfer";

type InitialEntry = {
  id: string;
  kind: "tx" | "sv";
  transaction_type: EntryType;
  transaction_date: string;
  account_id?: string | null;
  to_account_id?: string | null;
  category_id?: string | null;
  owner_id?: string | null;
  savings_goal_id?: string | null;
  savings_entry_type?: SavingsEntryType | null;
  saving_mode?: SavingMode | null;
  amount: number;
  description?: string | null;
  need_want?: string | null;
  fixed_variable?: string | null;
  notes?: string | null;
};

export function TransactionForm({
  accounts,
  categories,
  owners,
  goals,
  today,
  initial,
  defaultType,
  defaultGoalId,
  defaultSavingsEntryType,
}: {
  accounts: Account[];
  categories: Category[];
  owners: Owner[];
  goals: Goal[];
  today: string;
  initial?: InitialEntry;
  defaultType?: EntryType;
  defaultGoalId?: string;
  defaultSavingsEntryType?: SavingsEntryType;
}) {
  const [type, setType] = useState<EntryType>(initial?.transaction_type ?? defaultType ?? "expense");
  const [savingsEntryType, setSavingsEntryType] = useState<SavingsEntryType>(initial?.savings_entry_type ?? defaultSavingsEntryType ?? "deposit");
  const [savingMode, setSavingMode] = useState<SavingMode>(initial?.saving_mode ?? "earmark");
  const filteredCategories = useMemo(
    () => categories.filter((category) => category.category_type === (type === "income" ? "income" : "expense")),
    [categories, type],
  );
  const isEdit = Boolean(initial);
  const action = isEdit ? updateMoneyEntry : createMoneyEntry;
  const defaultOwner = initial?.owner_id ?? owners.find((owner) => owner.is_default)?.id ?? owners[0]?.id ?? "";
  const noAccounts = accounts.length === 0;
  const savingsUnavailable = type === "savings" && goals.length === 0;
  const transferUnavailable = (type === "transfer" || (type === "savings" && savingMode === "transfer")) && accounts.length < 2;
  const defaultCategory = filteredCategories.some((category) => category.id === initial?.category_id)
    ? initial?.category_id ?? ""
    : filteredCategories[0]?.id ?? "";
  const selectedGoal = initial?.savings_goal_id ?? defaultGoalId ?? goals[0]?.id ?? "";
  const firstAccount = initial?.account_id ?? accounts[0]?.id ?? "";
  const secondAccount = initial?.to_account_id ?? accounts.find((account) => account.id !== firstAccount)?.id ?? "";

  return (
    <form action={action} className="transaction-form">
      {initial && <><input type="hidden" name="id" value={initial.id} /><input type="hidden" name="kind" value={initial.kind} /></>}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="transaction_type">Type</label>
          <select id="transaction_type" name="transaction_type" value={type} onChange={(event) => setType(event.target.value as EntryType)} disabled={initial?.kind === "sv"}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
            {(!initial || initial.kind === "sv") && <option value="savings">Savings</option>}
          </select>
          {initial?.kind === "sv" && <input type="hidden" name="transaction_type" value="savings" />}
        </div>

        <div className="field">
          <label htmlFor="transaction_date">Date</label>
          <input id="transaction_date" name="transaction_date" type="date" defaultValue={initial?.transaction_date ?? today} required />
        </div>

        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={initial?.amount ?? ""} placeholder="0.00" required />
        </div>

        {type === "savings" && (
          <>
            <div className="field">
              <label htmlFor="savings_entry_type">Savings action</label>
              <select id="savings_entry_type" name="savings_entry_type" value={savingsEntryType} onChange={(event) => setSavingsEntryType(event.target.value as SavingsEntryType)}>
                <option value="deposit">Deposit / Add to goal</option>
                <option value="withdrawal">Withdrawal / Reduce goal</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="saving_mode">How is the money handled?</label>
              <select id="saving_mode" name="saving_mode" value={savingMode} onChange={(event) => setSavingMode(event.target.value as SavingMode)}>
                <option value="earmark">Earmark only — money stays in the same account</option>
                <option value="transfer">Transfer — money physically moves between accounts</option>
              </select>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="account_id">
            {type === "income" ? "Deposit to account" : type === "expense" ? "Pay from account" : type === "transfer" ? "From account" : savingMode === "earmark" ? "Account holding this money" : savingsEntryType === "withdrawal" ? "From savings account" : "From account"}
          </label>
          <select id="account_id" name="account_id" defaultValue={firstAccount} required>
            <option value="" disabled>Select account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_active === false ? " (inactive)" : ""}</option>)}
          </select>
        </div>

        {(type === "transfer" || (type === "savings" && savingMode === "transfer")) && (
          <div className="field">
            <label htmlFor="to_account_id">{type === "savings" && savingsEntryType === "deposit" ? "To savings account" : "To account"}</label>
            <select id="to_account_id" name="to_account_id" defaultValue={secondAccount} required>
              <option value="" disabled>Select destination</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_active === false ? " (inactive)" : ""}</option>)}
            </select>
          </div>
        )}

        {(type === "income" || type === "expense") && (
          <>
            <div className="field">
              <label htmlFor="category_id">Category</label>
              <select key={type} id="category_id" name="category_id" defaultValue={defaultCategory} required>
                <option value="" disabled>Select category</option>
                {filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="owner_id">Owner / Charge to</label>
              <select id="owner_id" name="owner_id" defaultValue={defaultOwner}>
                <option value="">No owner</option>
                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </div>
          </>
        )}

        {type === "savings" && (
          <div className="field">
            <label htmlFor="savings_goal_id">Savings goal</label>
            <select id="savings_goal_id" name="savings_goal_id" defaultValue={selectedGoal} required>
              <option value="" disabled>{goals.length ? "Select savings goal" : "No active savings goals"}</option>
              {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
            </select>
          </div>
        )}

        {type === "expense" && (
          <>
            <div className="field"><label htmlFor="need_want">Need or Want</label><select id="need_want" name="need_want" defaultValue={initial?.need_want ?? "need"}><option value="need">Need</option><option value="want">Want</option></select></div>
            <div className="field"><label htmlFor="fixed_variable">Expense type</label><select id="fixed_variable" name="fixed_variable" defaultValue={initial?.fixed_variable ?? "variable"}><option value="fixed">Fixed</option><option value="variable">Variable</option></select></div>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="description">Description <span className="muted">(optional)</span></label>
        <input id="description" name="description" type="text" defaultValue={initial?.description ?? ""} placeholder={type === "savings" ? (savingsEntryType === "withdrawal" ? "e.g. Use part of Emergency Fund" : "e.g. September emergency savings") : type === "transfer" ? "e.g. Move money to GCash" : "e.g. Groceries, Salary"} />
      </div>

      <div className="field">
        <label htmlFor="notes">Notes <span className="muted">(optional)</span></label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Add any details you want to remember." />
      </div>

      {type === "savings" && savingMode === "earmark" && <div className="notice info">Earmark mode changes your savings goal and Available amount, but does not change the real balance of the selected account.</div>}
      {type === "savings" && savingMode === "transfer" && <div className="notice info">Transfer mode changes your savings goal and also moves the same amount between the two selected accounts.</div>}
      {noAccounts && <div className="notice error">No accounts are available. Add an account first.</div>}
      {savingsUnavailable && <div className="notice error">You do not have an active savings goal. <Link href="/savings"><strong>Create or reactivate a savings goal</strong></Link> first.</div>}
      {transferUnavailable && <div className="notice error">This transfer needs at least two accounts. <Link href="/accounts"><strong>Add another account</strong></Link> first.</div>}

      <div className="form-actions"><button className="primary-btn" type="submit" disabled={noAccounts || savingsUnavailable || transferUnavailable}>{isEdit ? "Save changes" : "Save transaction"}</button></div>
    </form>
  );
}
