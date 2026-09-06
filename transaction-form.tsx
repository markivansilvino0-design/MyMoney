"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createMoneyEntry, updateMoneyEntry } from "@/app/(app)/transactions/actions";

type Account = { id: string; name: string; account_type: string };
type Category = { id: string; name: string; category_type: "income" | "expense" };
type Owner = { id: string; name: string; is_default: boolean };
type Goal = { id: string; name: string; target_amount: number; current_amount: number };
type EntryType = "income" | "expense" | "transfer" | "savings";

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
}: {
  accounts: Account[];
  categories: Category[];
  owners: Owner[];
  goals: Goal[];
  today: string;
  initial?: InitialEntry;
}) {
  const [type, setType] = useState<EntryType>(initial?.transaction_type ?? "expense");
  const filteredCategories = useMemo(
    () => categories.filter((c) => c.category_type === (type === "income" ? "income" : "expense")),
    [categories, type],
  );
  const isEdit = Boolean(initial);
  const action = isEdit ? updateMoneyEntry : createMoneyEntry;
  const defaultOwner = initial?.owner_id ?? owners.find((o) => o.is_default)?.id ?? owners[0]?.id ?? "";
  const noAccounts = accounts.length === 0;
  const savingsUnavailable = type === "savings" && goals.length === 0;
  const transferUnavailable = type === "transfer" && accounts.length < 2;
  const defaultCategory = filteredCategories.some((c) => c.id === initial?.category_id)
    ? initial?.category_id ?? ""
    : filteredCategories[0]?.id ?? "";

  return (
    <form action={action} className="transaction-form">
      {initial && <><input type="hidden" name="id" value={initial.id} /><input type="hidden" name="kind" value={initial.kind} /></>}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="transaction_type">Type</label>
          <select
            id="transaction_type"
            name="transaction_type"
            value={type}
            onChange={(e) => setType(e.target.value as EntryType)}
            disabled={initial?.kind === "sv"}
          >
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

        <div className="field">
          <label htmlFor="account_id">{type === "income" ? "Deposit to account" : type === "transfer" || type === "savings" ? "From account" : "Pay from account"}</label>
          <select id="account_id" name="account_id" defaultValue={initial?.account_id ?? accounts[0]?.id ?? ""} required>
            <option value="" disabled>Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {type === "transfer" && (
          <div className="field">
            <label htmlFor="to_account_id">To account</label>
            <select id="to_account_id" name="to_account_id" defaultValue={initial?.to_account_id ?? accounts[1]?.id ?? ""} required>
              <option value="" disabled>Select destination</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {(type === "income" || type === "expense") && (
          <>
            <div className="field">
              <label htmlFor="category_id">Category</label>
              <select key={type} id="category_id" name="category_id" defaultValue={defaultCategory} required>
                <option value="" disabled>Select category</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="owner_id">Owner / Charge to</label>
              <select id="owner_id" name="owner_id" defaultValue={defaultOwner}>
                <option value="">No owner</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </>
        )}

        {type === "savings" && (
          <div className="field">
            <label htmlFor="savings_goal_id">Savings goal</label>
            <select id="savings_goal_id" name="savings_goal_id" defaultValue={initial?.savings_goal_id ?? goals[0]?.id ?? ""} required>
              <option value="" disabled>{goals.length ? "Select savings goal" : "No savings goals yet"}</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        {type === "expense" && (
          <>
            <div className="field">
              <label htmlFor="need_want">Need or Want</label>
              <select id="need_want" name="need_want" defaultValue={initial?.need_want ?? "need"}>
                <option value="need">Need</option>
                <option value="want">Want</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fixed_variable">Expense type</label>
              <select id="fixed_variable" name="fixed_variable" defaultValue={initial?.fixed_variable ?? "variable"}>
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </div>
          </>
        )}
      </div>

      {type !== "savings" && (
        <div className="field">
          <label htmlFor="description">Description</label>
          <input id="description" name="description" type="text" defaultValue={initial?.description ?? ""} placeholder={type === "transfer" ? "e.g. Move money to GCash" : "e.g. Groceries, Salary"} />
        </div>
      )}

      <div className="field">
        <label htmlFor="notes">Notes <span className="muted">(optional)</span></label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Add any details you want to remember." />
      </div>

      {noAccounts && <div className="notice error">No accounts are available. Run the Phase 3 SQL migration in Supabase first.</div>}
      {savingsUnavailable && <div className="notice error">You do not have a savings goal yet. <Link href="/savings"><strong>Create a savings goal</strong></Link> first.</div>}
      {transferUnavailable && <div className="notice error">A transfer needs at least two accounts. <Link href="/accounts"><strong>Add another account</strong></Link> first.</div>}

      <div className="form-actions">
        <button className="primary-btn" type="submit" disabled={noAccounts || savingsUnavailable || transferUnavailable}>
          {isEdit ? "Save changes" : "Save transaction"}
        </button>
      </div>
    </form>
  );
}
