"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function backPath(month: string) {
  return `/budget?month=${encodeURIComponent(month)}`;
}

async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

function fail(message: string, month: string): never {
  redirect(`${backPath(month)}&error=${encodeURIComponent(message)}`);
}

export async function saveBudget(formData: FormData) {
  const { supabase, userId } = await getUser();
  const month = text(formData, "month");
  const categoryId = text(formData, "category_id");
  const amount = Number(text(formData, "budget_amount") || "0");

  if (!isMonth(month)) fail("Choose a valid budget month.", month || "");
  if (!categoryId) fail("Choose an expense category.", month);
  if (!Number.isFinite(amount) || amount < 0) fail("Budget amount must be zero or greater.", month);

  const { data: category } = await supabase
    .from("categories")
    .select("id,category_type")
    .eq("id", categoryId)
    .eq("category_type", "expense")
    .maybeSingle();

  if (!category) fail("That expense category is not available.", month);

  const monthStart = `${month}-01`;
  const { error } = await supabase.from("budgets").upsert(
    {
      user_id: userId,
      month_start: monthStart,
      category_id: categoryId,
      budget_amount: amount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_start,category_id" },
  );

  if (error) fail(error.message, month);
  revalidatePath("/budget");
  redirect(`${backPath(month)}&success=Budget%20saved.`);
}

export async function deleteBudget(formData: FormData) {
  const { supabase } = await getUser();
  const month = text(formData, "month");
  const id = text(formData, "id");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "");
  if (!id) fail("Missing budget record.", month);

  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) fail(error.message, month);
  revalidatePath("/budget");
  redirect(`${backPath(month)}&success=Budget%20removed.`);
}

export async function copyPreviousMonthBudgets(formData: FormData) {
  const { supabase, userId } = await getUser();
  const month = text(formData, "month");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "");

  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  const previousMonth = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
  const previousStart = `${previousMonth}-01`;
  const currentStart = `${month}-01`;

  const { data: previousBudgets, error: previousError } = await supabase
    .from("budgets")
    .select("category_id,budget_amount")
    .eq("month_start", previousStart);

  if (previousError) fail(previousError.message, month);
  if (!previousBudgets?.length) fail("The previous month has no budgets to copy.", month);

  const payload = previousBudgets.map((row) => ({
    user_id: userId,
    month_start: currentStart,
    category_id: row.category_id,
    budget_amount: Number(row.budget_amount),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("budgets").upsert(payload, { onConflict: "user_id,month_start,category_id" });
  if (error) fail(error.message, month);

  revalidatePath("/budget");
  redirect(`${backPath(month)}&success=Previous%20month%20budgets%20copied.`);
}
