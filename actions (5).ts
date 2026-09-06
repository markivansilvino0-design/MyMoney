"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createSavingsGoal(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = Number(String(formData.get("target_amount") ?? "0"));
  const targetDate = String(formData.get("target_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) redirect("/savings?error=Goal%20name%20is%20required.");
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) redirect("/savings?error=Target%20amount%20must%20be%20greater%20than%20zero.");

  const { error } = await supabase.from("savings_goals").insert({
    user_id: userId,
    name,
    target_amount: targetAmount,
    target_date: targetDate,
    notes,
  });

  if (error) redirect(`/savings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/savings");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect("/savings?success=Savings%20goal%20created.");
}
