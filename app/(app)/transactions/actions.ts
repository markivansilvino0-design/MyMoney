"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { savingsGoalImpact } from "@/lib/finance";

type EntryType = "income" | "expense" | "transfer" | "savings";
type OwnershipTable = "accounts" | "categories" | "owners" | "savings_goals";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function fail(message: string, backTo = "/transactions"): never {
  redirect(`${backTo}?error=${encodeURIComponent(message)}`);
}

async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

async function owns(supabase: Awaited<ReturnType<typeof createClient>>, table: OwnershipTable, id: string | null) {
  if (!id) return false;
  const { data } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  return Boolean(data?.id);
}

function parseAmount(formData: FormData) {
  const amount = Number(text(formData, "amount"));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function validateSavingsGoalBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  goalId: string,
  newEntryType: string,
  newAmount: number,
  oldEntry?: { savings_goal_id: string; entry_type: string | null; amount: number | string } | null,
) {
  const goalIds = Array.from(new Set([goalId, oldEntry?.savings_goal_id].filter(Boolean) as string[]));
  const { data: goals } = await supabase.from("savings_goals").select("id,current_amount").in("id", goalIds);
  const currentMap = new Map<string, number>((goals ?? []).map((goal) => [goal.id, Number(goal.current_amount)] as [string, number]));
  if (!currentMap.has(goalId)) return "Choose a valid savings goal.";

  if (!oldEntry) {
    const resulting = (currentMap.get(goalId) ?? 0) + savingsGoalImpact(newEntryType, newAmount);
    return resulting < -0.00001 ? "A withdrawal cannot be greater than the amount currently saved in this goal." : null;
  }

  const oldImpact = savingsGoalImpact(oldEntry.entry_type, oldEntry.amount);
  const newImpact = savingsGoalImpact(newEntryType, newAmount);

  if (oldEntry.savings_goal_id === goalId) {
    const resulting = (currentMap.get(goalId) ?? 0) - oldImpact + newImpact;
    return resulting < -0.00001 ? "This change would make the savings goal balance negative." : null;
  }

  const newGoalResult = (currentMap.get(goalId) ?? 0) + newImpact;
  if (newGoalResult < -0.00001) return "A withdrawal cannot be greater than the amount currently saved in the selected goal.";
  return null;
}

function revalidateMoneyPages(goalId?: string | null, accountId?: string | null, toAccountId?: string | null) {
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/savings");
  if (goalId) revalidatePath(`/savings/${goalId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
  if (toAccountId) revalidatePath(`/accounts/${toAccountId}`);
}

export async function createMoneyEntry(formData: FormData) {
  const { supabase, userId } = await getUser();
  const type = text(formData, "transaction_type") as EntryType;
  const date = text(formData, "transaction_date");
  const amount = parseAmount(formData);
  const accountId = optionalText(formData, "account_id");
  const toAccountId = optionalText(formData, "to_account_id");
  const categoryId = optionalText(formData, "category_id");
  const ownerId = optionalText(formData, "owner_id");
  const savingsGoalId = optionalText(formData, "savings_goal_id");
  const description = optionalText(formData, "description");
  const notes = optionalText(formData, "notes");
  const needWant = optionalText(formData, "need_want");
  const fixedVariable = optionalText(formData, "fixed_variable");

  if (!["income", "expense", "transfer", "savings"].includes(type)) fail("Choose a valid transaction type.");
  if (!validDate(date)) fail("Choose a valid transaction date.");
  if (!amount) fail("Amount must be greater than zero.");

  if (type === "savings") {
    const entryType = text(formData, "savings_entry_type") || "deposit";
    const savingMode = text(formData, "saving_mode") || "earmark";
    if (!["deposit", "withdrawal"].includes(entryType)) fail("Choose Deposit or Withdrawal for savings activity.");
    if (!["earmark", "transfer"].includes(savingMode)) fail("Choose a valid savings mode.");
    if (!(await owns(supabase, "accounts", accountId))) fail("Choose a valid account.");
    if (!(await owns(supabase, "savings_goals", savingsGoalId))) fail("Choose a valid savings goal.");

    if (savingMode === "transfer") {
      if (!(await owns(supabase, "accounts", toAccountId))) fail("Choose a valid destination account.");
      if (accountId === toAccountId) fail("The source and destination accounts must be different.");
    }

    const balanceError = await validateSavingsGoalBalance(supabase, savingsGoalId!, entryType, amount);
    if (balanceError) fail(balanceError);

    const { error } = await supabase.from("savings_contributions").insert({
      user_id: userId,
      savings_goal_id: savingsGoalId,
      from_account_id: accountId,
      to_account_id: savingMode === "transfer" ? toAccountId : null,
      entry_type: entryType,
      saving_mode: savingMode,
      amount,
      contribution_date: date,
      description,
      notes,
    });
    if (error) fail(error.message);
    revalidateMoneyPages(savingsGoalId, accountId, savingMode === "transfer" ? toAccountId : null);
  } else {
    if (!(await owns(supabase, "accounts", accountId))) fail("Choose a valid account.");

    if (type === "transfer") {
      if (!(await owns(supabase, "accounts", toAccountId))) fail("Choose a valid destination account.");
      if (accountId === toAccountId) fail("The source and destination accounts must be different.");
    }

    if ((type === "income" || type === "expense") && !(await owns(supabase, "categories", categoryId))) fail("Choose a valid category.");
    if ((type === "income" || type === "expense") && ownerId && !(await owns(supabase, "owners", ownerId))) fail("Choose a valid owner.");

    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      transaction_date: date,
      transaction_type: type,
      account_id: accountId,
      to_account_id: type === "transfer" ? toAccountId : null,
      category_id: type === "income" || type === "expense" ? categoryId : null,
      owner_id: type === "income" || type === "expense" ? ownerId : null,
      amount,
      description,
      need_want: type === "expense" && ["need", "want"].includes(needWant ?? "") ? needWant : null,
      fixed_variable: type === "expense" && ["fixed", "variable"].includes(fixedVariable ?? "") ? fixedVariable : null,
      notes,
    });
    if (error) fail(error.message);
    revalidateMoneyPages(null, accountId, type === "transfer" ? toAccountId : null);
  }

  redirect("/transactions?success=Transaction%20saved.");
}

export async function updateMoneyEntry(formData: FormData) {
  const { supabase } = await getUser();
  const kind = text(formData, "kind");
  const id = text(formData, "id");
  const backTo = `/transactions/${kind}/${id}`;
  const date = text(formData, "transaction_date");
  const amount = parseAmount(formData);
  const accountId = optionalText(formData, "account_id");
  const description = optionalText(formData, "description");
  const notes = optionalText(formData, "notes");

  if (!id) fail("Missing transaction ID.", "/transactions");
  if (!validDate(date)) fail("Choose a valid transaction date.", backTo);
  if (!amount) fail("Amount must be greater than zero.", backTo);
  if (!(await owns(supabase, "accounts", accountId))) fail("Choose a valid account.", backTo);

  if (kind === "sv") {
    const savingsGoalId = optionalText(formData, "savings_goal_id");
    const toAccountId = optionalText(formData, "to_account_id");
    const entryType = text(formData, "savings_entry_type") || "deposit";
    const savingMode = text(formData, "saving_mode") || "earmark";

    if (!(await owns(supabase, "savings_goals", savingsGoalId))) fail("Choose a valid savings goal.", backTo);
    if (!["deposit", "withdrawal"].includes(entryType)) fail("Choose Deposit or Withdrawal.", backTo);
    if (!["earmark", "transfer"].includes(savingMode)) fail("Choose a valid savings mode.", backTo);
    if (savingMode === "transfer") {
      if (!(await owns(supabase, "accounts", toAccountId))) fail("Choose a valid destination account.", backTo);
      if (accountId === toAccountId) fail("The source and destination accounts must be different.", backTo);
    }

    const { data: oldEntry } = await supabase.from("savings_contributions").select("savings_goal_id,entry_type,amount,from_account_id,to_account_id").eq("id", id).maybeSingle();
    if (!oldEntry) fail("Savings entry not found.", "/transactions");
    const balanceError = await validateSavingsGoalBalance(supabase, savingsGoalId!, entryType, amount, oldEntry);
    if (balanceError) fail(balanceError, backTo);

    const { error } = await supabase.from("savings_contributions").update({
      savings_goal_id: savingsGoalId,
      from_account_id: accountId,
      to_account_id: savingMode === "transfer" ? toAccountId : null,
      entry_type: entryType,
      saving_mode: savingMode,
      amount,
      contribution_date: date,
      description,
      notes,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) fail(error.message, backTo);
    revalidateMoneyPages(savingsGoalId, accountId, toAccountId);
    if (oldEntry.savings_goal_id !== savingsGoalId) revalidatePath(`/savings/${oldEntry.savings_goal_id}`);
    if (oldEntry.from_account_id) revalidatePath(`/accounts/${oldEntry.from_account_id}`);
    if (oldEntry.to_account_id) revalidatePath(`/accounts/${oldEntry.to_account_id}`);
  } else if (kind === "tx") {
    const type = text(formData, "transaction_type") as Exclude<EntryType, "savings">;
    const toAccountId = optionalText(formData, "to_account_id");
    const categoryId = optionalText(formData, "category_id");
    const ownerId = optionalText(formData, "owner_id");
    const needWant = optionalText(formData, "need_want");
    const fixedVariable = optionalText(formData, "fixed_variable");

    if (!["income", "expense", "transfer"].includes(type)) fail("Choose a valid transaction type.", backTo);
    if (type === "transfer") {
      if (!(await owns(supabase, "accounts", toAccountId))) fail("Choose a valid destination account.", backTo);
      if (accountId === toAccountId) fail("The source and destination accounts must be different.", backTo);
    }
    if ((type === "income" || type === "expense") && !(await owns(supabase, "categories", categoryId))) fail("Choose a valid category.", backTo);
    if ((type === "income" || type === "expense") && ownerId && !(await owns(supabase, "owners", ownerId))) fail("Choose a valid owner.", backTo);

    const { data: oldEntry } = await supabase.from("transactions").select("account_id,to_account_id").eq("id", id).maybeSingle();
    const { error } = await supabase.from("transactions").update({
      transaction_date: date,
      transaction_type: type,
      account_id: accountId,
      to_account_id: type === "transfer" ? toAccountId : null,
      category_id: type === "income" || type === "expense" ? categoryId : null,
      owner_id: type === "income" || type === "expense" ? ownerId : null,
      amount,
      description,
      need_want: type === "expense" && ["need", "want"].includes(needWant ?? "") ? needWant : null,
      fixed_variable: type === "expense" && ["fixed", "variable"].includes(fixedVariable ?? "") ? fixedVariable : null,
      notes,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) fail(error.message, backTo);
    revalidateMoneyPages(null, accountId, type === "transfer" ? toAccountId : null);
    if (oldEntry?.account_id) revalidatePath(`/accounts/${oldEntry.account_id}`);
    if (oldEntry?.to_account_id) revalidatePath(`/accounts/${oldEntry.to_account_id}`);
  } else {
    fail("Unknown transaction type.", "/transactions");
  }

  revalidatePath(backTo);
  redirect(`${backTo}?success=Changes%20saved.`);
}

export async function deleteMoneyEntry(formData: FormData) {
  const { supabase } = await getUser();
  const kind = text(formData, "kind");
  const id = text(formData, "id");
  if (!id) fail("Missing transaction ID.");

  if (kind === "sv") {
    const { data: row } = await supabase.from("savings_contributions").select("savings_goal_id,from_account_id,to_account_id").eq("id", id).maybeSingle();
    const { error } = await supabase.from("savings_contributions").delete().eq("id", id);
    if (error) fail(error.message, `/transactions/${kind}/${id}`);
    revalidateMoneyPages(row?.savings_goal_id, row?.from_account_id, row?.to_account_id);
  } else if (kind === "tx") {
    const { data: row } = await supabase.from("transactions").select("account_id,to_account_id").eq("id", id).maybeSingle();
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) fail(error.message, `/transactions/${kind}/${id}`);
    revalidateMoneyPages(null, row?.account_id, row?.to_account_id);
  } else {
    fail("Unknown transaction type.");
  }

  redirect("/transactions?success=Transaction%20deleted.");
}
