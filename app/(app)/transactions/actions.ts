"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

async function owns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: OwnershipTable,
  id: string | null,
) {
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
    if (!(await owns(supabase, "accounts", accountId))) fail("Choose a valid source account.");
    if (!(await owns(supabase, "savings_goals", savingsGoalId))) fail("Choose a valid savings goal.");

    const { error } = await supabase.from("savings_contributions").insert({
      user_id: userId,
      savings_goal_id: savingsGoalId,
      from_account_id: accountId,
      amount,
      contribution_date: date,
      notes: notes ?? description,
    });
    if (error) fail(error.message);
  } else {
    if (!(await owns(supabase, "accounts", accountId))) fail("Choose a valid account.");

    if (type === "transfer") {
      if (!(await owns(supabase, "accounts", toAccountId))) fail("Choose a valid destination account.");
      if (accountId === toAccountId) fail("The source and destination accounts must be different.");
    }

    if ((type === "income" || type === "expense") && !(await owns(supabase, "categories", categoryId))) {
      fail("Choose a valid category.");
    }
    if ((type === "income" || type === "expense") && ownerId && !(await owns(supabase, "owners", ownerId))) {
      fail("Choose a valid owner.");
    }

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
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
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
    if (!(await owns(supabase, "savings_goals", savingsGoalId))) fail("Choose a valid savings goal.", backTo);

    const { error } = await supabase
      .from("savings_contributions")
      .update({
        savings_goal_id: savingsGoalId,
        from_account_id: accountId,
        amount,
        contribution_date: date,
        notes: notes ?? description,
      })
      .eq("id", id);
    if (error) fail(error.message, backTo);
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
    if ((type === "income" || type === "expense") && !(await owns(supabase, "categories", categoryId))) {
      fail("Choose a valid category.", backTo);
    }
    if ((type === "income" || type === "expense") && ownerId && !(await owns(supabase, "owners", ownerId))) {
      fail("Choose a valid owner.", backTo);
    }

    const { error } = await supabase
      .from("transactions")
      .update({
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
      })
      .eq("id", id);
    if (error) fail(error.message, backTo);
  } else {
    fail("Unknown transaction type.", "/transactions");
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath(backTo);
  redirect(`${backTo}?success=Changes%20saved.`);
}

export async function deleteMoneyEntry(formData: FormData) {
  const { supabase } = await getUser();
  const kind = text(formData, "kind");
  const id = text(formData, "id");
  if (!id) fail("Missing transaction ID.");

  const table = kind === "sv" ? "savings_contributions" : kind === "tx" ? "transactions" : null;
  if (!table) fail("Unknown transaction type.");

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) fail(error.message, `/transactions/${kind}/${id}`);

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect("/transactions?success=Transaction%20deleted.");
}
