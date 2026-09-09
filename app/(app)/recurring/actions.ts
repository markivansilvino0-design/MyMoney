"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type RuleType = "income" | "expense" | "transfer" | "savings" | "card_purchase" | "card_payment";
type Frequency = "weekly" | "biweekly" | "monthly" | "yearly";
type OwnershipTable = "accounts" | "categories" | "owners" | "savings_goals" | "credit_cards";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseAmount(formData: FormData) {
  const amount = Number(text(formData, "amount"));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function fail(message: string): never {
  redirect(`/recurring?error=${encodeURIComponent(message)}`);
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

export async function createRecurringRule(formData: FormData) {
  const { supabase, userId } = await getUser();
  const name = text(formData, "name");
  const ruleType = text(formData, "rule_type") as RuleType;
  const frequency = text(formData, "frequency") as Frequency;
  const amount = parseAmount(formData);
  const startDate = text(formData, "start_date");
  const endDate = optionalText(formData, "end_date");
  const accountId = optionalText(formData, "account_id");
  const toAccountId = optionalText(formData, "to_account_id");
  const categoryId = optionalText(formData, "category_id");
  const ownerId = optionalText(formData, "owner_id");
  const savingsGoalId = optionalText(formData, "savings_goal_id");
  const creditCardId = optionalText(formData, "credit_card_id");
  const savingsEntryType = optionalText(formData, "savings_entry_type");
  const savingMode = optionalText(formData, "saving_mode");
  const needWant = optionalText(formData, "need_want");
  const fixedVariable = optionalText(formData, "fixed_variable");
  const description = optionalText(formData, "description");
  const notes = optionalText(formData, "notes");
  const autoPost = text(formData, "auto_post") === "on";

  if (!name) fail("Give this recurring item a name.");
  if (!["income", "expense", "transfer", "savings", "card_purchase", "card_payment"].includes(ruleType)) fail("Choose a valid recurring type.");
  if (!["weekly", "biweekly", "monthly", "yearly"].includes(frequency)) fail("Choose a valid frequency.");
  if (!amount) fail("Amount must be greater than zero.");
  if (!validDate(startDate)) fail("Choose a valid start date.");
  if (endDate && !validDate(endDate)) fail("Choose a valid end date.");
  if (endDate && endDate < startDate) fail("End date cannot be before the start date.");

  const needsAccount = ["income", "expense", "transfer", "savings", "card_payment"].includes(ruleType);
  const needsDestination = ruleType === "transfer" || (ruleType === "savings" && savingMode === "transfer");
  const needsCategory = ["income", "expense", "card_purchase"].includes(ruleType);
  const needsCard = ["card_purchase", "card_payment"].includes(ruleType);
  const needsGoal = ruleType === "savings";

  if (needsDestination && accountId === toAccountId) fail("Source and destination accounts must be different.");
  if (ruleType === "savings" && !["deposit", "withdrawal"].includes(savingsEntryType ?? "")) fail("Choose a savings action.");
  if (ruleType === "savings" && !["earmark", "transfer"].includes(savingMode ?? "")) fail("Choose how recurring savings should be handled.");

  const [accountOwned, destinationOwned, categoryOwned, ownerOwned, goalOwned, cardOwned] = await Promise.all([
    needsAccount ? owns(supabase, "accounts", accountId) : Promise.resolve(true),
    needsDestination ? owns(supabase, "accounts", toAccountId) : Promise.resolve(true),
    needsCategory ? owns(supabase, "categories", categoryId) : Promise.resolve(true),
    ownerId ? owns(supabase, "owners", ownerId) : Promise.resolve(true),
    needsGoal ? owns(supabase, "savings_goals", savingsGoalId) : Promise.resolve(true),
    needsCard ? owns(supabase, "credit_cards", creditCardId) : Promise.resolve(true),
  ]);

  if (!accountOwned) fail("Choose a valid account.");
  if (!destinationOwned) fail("Choose a valid destination account.");
  if (!categoryOwned) fail("Choose a valid category.");
  if (!ownerOwned) fail("Choose a valid owner.");
  if (!goalOwned) fail("Choose a valid savings goal.");
  if (!cardOwned) fail("Choose a valid credit card.");

  const { error } = await supabase.from("recurring_rules").insert({
    user_id: userId,
    name,
    rule_type: ruleType,
    frequency,
    amount,
    start_date: startDate,
    end_date: endDate,
    account_id: needsAccount ? accountId : null,
    to_account_id: needsDestination ? toAccountId : null,
    category_id: needsCategory ? categoryId : null,
    owner_id: needsCategory ? ownerId : null,
    savings_goal_id: needsGoal ? savingsGoalId : null,
    credit_card_id: needsCard ? creditCardId : null,
    savings_entry_type: ruleType === "savings" ? savingsEntryType : null,
    saving_mode: ruleType === "savings" ? savingMode : null,
    need_want: ["expense", "card_purchase"].includes(ruleType) && ["need", "want"].includes(needWant ?? "") ? needWant : null,
    fixed_variable: ["expense", "card_purchase"].includes(ruleType) && ["fixed", "variable"].includes(fixedVariable ?? "") ? fixedVariable : null,
    description,
    notes,
    auto_post: autoPost,
  });

  if (error) fail(error.message);
  redirect("/recurring?success=Recurring%20item%20created.");
}

export async function setRecurringRuleStatus(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!id || !["active", "paused", "archived"].includes(status)) fail("Invalid recurring item update.");

  const { error } = await supabase
    .from("recurring_rules")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(error.message);
  redirect(`/recurring?success=${encodeURIComponent(status === "active" ? "Recurring item resumed." : status === "paused" ? "Recurring item paused." : "Recurring item archived.")}`);
}

export async function postRecurringOccurrence(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  if (!id) fail("Missing recurring occurrence.");
  const { error } = await supabase.rpc("post_recurring_occurrence", { p_occurrence_id: id });
  if (error) fail(error.message);
  redirect("/recurring?success=Recurring%20item%20posted.");
}

export async function skipRecurringOccurrence(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  if (!id) fail("Missing recurring occurrence.");
  const { error } = await supabase
    .from("recurring_occurrences")
    .update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "scheduled");
  if (error) fail(error.message);
  redirect("/recurring?success=Occurrence%20skipped.");
}

export async function postAllDueRecurring() {
  const { supabase } = await getUser();
  const { data, error } = await supabase.rpc("post_my_due_recurring");
  if (error) fail(error.message);
  redirect(`/recurring?success=${encodeURIComponent(`${Number(data ?? 0)} due item${Number(data ?? 0) === 1 ? "" : "s"} posted.`)}`);
}

export async function refreshRecurringSchedule() {
  const { supabase } = await getUser();
  const { error } = await supabase.rpc("refresh_my_recurring_schedule");
  if (error) fail(error.message);
  redirect("/recurring?success=Schedule%20refreshed.");
}
