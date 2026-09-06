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

export async function createSavingsGoal(formData: FormData) {
  const { supabase, userId } = await getUser();
  const name = text(formData, "name");
  const targetAmount = Number(text(formData, "target_amount") || "0");
  const targetDate = text(formData, "target_date") || null;
  const notes = text(formData, "notes") || null;

  if (!name) fail("Goal name is required.");
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) fail("Target amount must be greater than zero.");

  const { error } = await supabase.from("savings_goals").insert({
    user_id: userId,
    name,
    target_amount: targetAmount,
    target_date: targetDate,
    notes,
  });

  if (error) fail(error.message);
  revalidatePath("/savings");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect("/savings?success=Savings%20goal%20created.");
}

export async function updateSavingsGoal(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const backTo = `/savings/${id}`;
  const name = text(formData, "name");
  const targetAmount = Number(text(formData, "target_amount") || "0");
  const targetDate = text(formData, "target_date") || null;
  const notes = text(formData, "notes") || null;
  const status = text(formData, "status");

  if (!id) fail("Missing savings goal ID.");
  if (!name) fail("Goal name is required.", backTo);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) fail("Target amount must be greater than zero.", backTo);
  if (!["active", "completed", "paused", "archived"].includes(status)) fail("Choose a valid goal status.", backTo);

  const { error } = await supabase
    .from("savings_goals")
    .update({ name, target_amount: targetAmount, target_date: targetDate, notes, status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) fail(error.message, backTo);
  revalidatePath("/savings");
  revalidatePath(backTo);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
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
  redirect("/savings?success=Goal%20deleted.");
}
