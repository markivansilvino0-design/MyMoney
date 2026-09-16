"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string, path = "/savings"): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

async function validAccount(supabase: Awaited<ReturnType<typeof createClient>>, accountId: string | null) {
  if (!accountId) return true;
  const { data } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  return Boolean(data);
}

function goalFields(formData: FormData) {
  const name = text(formData, "name");
  const targetAmount = Number(text(formData, "target_amount") || "0");
  const targetDate = text(formData, "target_date") || null;
  const notes = text(formData, "notes") || null;
  const goalType = text(formData, "goal_type") || "standard";
  const defaultAccountId = text(formData, "default_account_id") || null;
  const defaultSavingMode = text(formData, "default_saving_mode") || "earmark";
  return { name, targetAmount, targetDate, notes, goalType, defaultAccountId, defaultSavingMode };
}

export async function createSavingsGoal(formData: FormData) {
  const { supabase, userId } = await getUser();
  const fields = goalFields(formData);

  if (!fields.name) fail("Goal name is required.");
  if (!Number.isFinite(fields.targetAmount) || fields.targetAmount <= 0) fail("Target amount must be greater than zero.");
  if (!["standard", "sinking"].includes(fields.goalType)) fail("Choose a valid savings goal type.");
  if (!["earmark", "transfer"].includes(fields.defaultSavingMode)) fail("Choose a valid default savings method.");
  if (fields.goalType === "sinking" && !fields.targetDate) fail("A sinking fund needs a target date.");
  if (!(await validAccount(supabase, fields.defaultAccountId))) fail("Choose a valid default savings account.");

  const { error } = await supabase.from("savings_goals").insert({
    user_id: userId,
    name: fields.name,
    target_amount: fields.targetAmount,
    target_date: fields.targetDate,
    notes: fields.notes,
    goal_type: fields.goalType,
    default_account_id: fields.defaultAccountId,
    default_saving_mode: fields.defaultSavingMode,
  });

  if (error) fail(error.message);
  revalidatePath("/savings");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budget");
  redirect("/savings?success=Savings%20goal%20created.");
}

export async function updateSavingsGoal(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const backTo = `/savings/${id}`;
  const fields = goalFields(formData);
  const status = text(formData, "status");

  if (!id) fail("Missing savings goal ID.");
  if (!fields.name) fail("Goal name is required.", backTo);
  if (!Number.isFinite(fields.targetAmount) || fields.targetAmount <= 0) fail("Target amount must be greater than zero.", backTo);
  if (!["active", "completed", "paused", "archived"].includes(status)) fail("Choose a valid goal status.", backTo);
  if (!["standard", "sinking"].includes(fields.goalType)) fail("Choose a valid savings goal type.", backTo);
  if (!["earmark", "transfer"].includes(fields.defaultSavingMode)) fail("Choose a valid default savings method.", backTo);
  if (fields.goalType === "sinking" && !fields.targetDate) fail("A sinking fund needs a target date.", backTo);
  if (!(await validAccount(supabase, fields.defaultAccountId))) fail("Choose a valid default savings account.", backTo);

  const { error } = await supabase
    .from("savings_goals")
    .update({
      name: fields.name,
      target_amount: fields.targetAmount,
      target_date: fields.targetDate,
      notes: fields.notes,
      status,
      goal_type: fields.goalType,
      default_account_id: fields.defaultAccountId,
      default_saving_mode: fields.defaultSavingMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) fail(error.message, backTo);
  revalidatePath("/savings");
  revalidatePath(backTo);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budget");
  redirect(`${backTo}?success=Goal%20updated.`);
}

export async function archiveSavingsGoal(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  if (!id) fail("Missing savings goal ID.");

  const { error } = await supabase.from("savings_goals").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error.message, `/savings/${id}`);

  revalidatePath("/savings");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  redirect("/savings?success=Goal%20archived.");
}

export async function deleteSavingsGoal(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const backTo = `/savings/${id}`;
  if (!id) fail("Missing savings goal ID.");

  const { data: history } = await supabase.from("savings_contributions").select("id").eq("savings_goal_id", id).limit(1);
  if ((history?.length ?? 0) > 0) fail("This goal has contribution history. Archive it instead of deleting it.", backTo);

  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) fail(error.message, backTo);

  revalidatePath("/savings");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budget");
  redirect("/savings?success=Goal%20deleted.");
}
