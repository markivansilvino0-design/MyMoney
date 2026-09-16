"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function isMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function backPath(month: string, ownerId: string) {
  const owner = ownerId || "all";
  return `/budget?month=${encodeURIComponent(month)}&owner=${encodeURIComponent(owner)}`;
}

async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

function fail(message: string, month: string, ownerId: string): never {
  redirect(`${backPath(month, ownerId)}&error=${encodeURIComponent(message)}`);
}

async function validateOwnerAndCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  categoryId: string,
) {
  const [{ data: owner }, { data: category }] = await Promise.all([
    supabase.from("owners").select("id").eq("id", ownerId).eq("is_active", true).maybeSingle(),
    supabase.from("categories").select("id,category_type").eq("id", categoryId).eq("category_type", "expense").eq("is_active", true).maybeSingle(),
  ]);
  return Boolean(owner && category);
}

export async function saveBudget(formData: FormData) {
  const { supabase, userId } = await getUser();
  const month = text(formData, "month");
  const ownerId = text(formData, "owner_id");
  const categoryId = text(formData, "category_id");
  const amount = Number(text(formData, "budget_amount") || "0");
  const rolloverEnabled = checked(formData, "rollover_enabled");

  if (!isMonth(month)) fail("Choose a valid budget month.", month || "", ownerId);
  if (!ownerId || ownerId === "all") fail("Choose a specific owner before editing a budget.", month, ownerId);
  if (!categoryId) fail("Choose an expense category.", month, ownerId);
  if (!Number.isFinite(amount) || amount < 0) fail("Budget amount must be zero or greater.", month, ownerId);
  if (!(await validateOwnerAndCategory(supabase, ownerId, categoryId))) fail("That owner or expense category is not available.", month, ownerId);

  const { error } = await supabase.from("budgets").upsert(
    {
      user_id: userId,
      month_start: `${month}-01`,
      owner_id: ownerId,
      category_id: categoryId,
      budget_amount: amount,
      rollover_enabled: rolloverEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_start,owner_id,category_id" },
  );

  if (error) fail(error.message, month, ownerId);
  revalidatePath("/budget");
  redirect(`${backPath(month, ownerId)}&success=Budget%20saved.`);
}

export async function deleteBudget(formData: FormData) {
  const { supabase } = await getUser();
  const month = text(formData, "month");
  const ownerId = text(formData, "owner_id");
  const id = text(formData, "id");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "", ownerId);
  if (!id) fail("Missing budget record.", month, ownerId);

  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) fail(error.message, month, ownerId);
  revalidatePath("/budget");
  redirect(`${backPath(month, ownerId)}&success=Budget%20removed.`);
}

export async function copyPreviousMonthBudgets(formData: FormData) {
  const { supabase, userId } = await getUser();
  const month = text(formData, "month");
  const ownerId = text(formData, "owner_id");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "", ownerId);
  if (!ownerId || ownerId === "all") fail("Choose a specific owner before copying a budget.", month, ownerId);

  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  const previousMonth = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: previousBudgets, error: previousError } = await supabase
    .from("budgets")
    .select("category_id,budget_amount,rollover_enabled")
    .eq("month_start", `${previousMonth}-01`)
    .eq("owner_id", ownerId);

  if (previousError) fail(previousError.message, month, ownerId);
  if (!previousBudgets?.length) fail("The previous month has no budgets for this owner.", month, ownerId);

  const payload = previousBudgets.map((row) => ({
    user_id: userId,
    month_start: `${month}-01`,
    owner_id: ownerId,
    category_id: row.category_id,
    budget_amount: Number(row.budget_amount),
    rollover_enabled: Boolean(row.rollover_enabled),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("budgets").upsert(payload, { onConflict: "user_id,month_start,owner_id,category_id" });
  if (error) fail(error.message, month, ownerId);

  revalidatePath("/budget");
  redirect(`${backPath(month, ownerId)}&success=Previous%20month%20budgets%20copied.`);
}

export async function saveBudgetTemplate(formData: FormData) {
  const { supabase, userId } = await getUser();
  const month = text(formData, "month");
  const ownerId = text(formData, "owner_id");
  const name = text(formData, "template_name");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "", ownerId);
  if (!ownerId || ownerId === "all") fail("Choose a specific owner before saving a template.", month, ownerId);
  if (!name) fail("Enter a template name.", month, ownerId);

  const { data: rows, error: rowsError } = await supabase
    .from("budgets")
    .select("category_id,budget_amount,rollover_enabled")
    .eq("month_start", `${month}-01`)
    .eq("owner_id", ownerId)
    .gt("budget_amount", 0);
  if (rowsError) fail(rowsError.message, month, ownerId);
  if (!rows?.length) fail("Add at least one budget amount before saving a template.", month, ownerId);

  const { data: existing } = await supabase
    .from("budget_templates")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("name", name)
    .maybeSingle();

  let templateId = existing?.id;
  if (!templateId) {
    const { data: created, error } = await supabase
      .from("budget_templates")
      .insert({ user_id: userId, owner_id: ownerId, name })
      .select("id")
      .single();
    if (error) fail(error.message, month, ownerId);
    templateId = created.id;
  } else {
    const { error } = await supabase.from("budget_templates").update({ updated_at: new Date().toISOString() }).eq("id", templateId);
    if (error) fail(error.message, month, ownerId);
    const { error: clearError } = await supabase.from("budget_template_items").delete().eq("template_id", templateId);
    if (clearError) fail(clearError.message, month, ownerId);
  }

  const { error: itemError } = await supabase.from("budget_template_items").insert(
    rows.map((row) => ({
      user_id: userId,
      template_id: templateId,
      category_id: row.category_id,
      budget_amount: Number(row.budget_amount),
      rollover_enabled: Boolean(row.rollover_enabled),
    })),
  );
  if (itemError) fail(itemError.message, month, ownerId);

  revalidatePath("/budget");
  redirect(`${backPath(month, ownerId)}&success=Budget%20template%20saved.`);
}

export async function applyBudgetTemplate(formData: FormData) {
  const { supabase, userId } = await getUser();
  const month = text(formData, "month");
  const ownerId = text(formData, "owner_id");
  const templateId = text(formData, "template_id");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "", ownerId);
  if (!ownerId || ownerId === "all") fail("Choose a specific owner before applying a template.", month, ownerId);
  if (!templateId) fail("Choose a template.", month, ownerId);

  const { data: template } = await supabase.from("budget_templates").select("id,owner_id").eq("id", templateId).maybeSingle();
  if (!template || template.owner_id !== ownerId) fail("That template is not available for this owner.", month, ownerId);

  const { data: items, error: itemError } = await supabase
    .from("budget_template_items")
    .select("category_id,budget_amount,rollover_enabled")
    .eq("template_id", templateId);
  if (itemError) fail(itemError.message, month, ownerId);
  if (!items?.length) fail("This template has no budget items.", month, ownerId);

  const { error } = await supabase.from("budgets").upsert(
    items.map((item) => ({
      user_id: userId,
      month_start: `${month}-01`,
      owner_id: ownerId,
      category_id: item.category_id,
      budget_amount: Number(item.budget_amount),
      rollover_enabled: Boolean(item.rollover_enabled),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,month_start,owner_id,category_id" },
  );
  if (error) fail(error.message, month, ownerId);

  revalidatePath("/budget");
  redirect(`${backPath(month, ownerId)}&success=Budget%20template%20applied.`);
}

export async function deleteBudgetTemplate(formData: FormData) {
  const { supabase } = await getUser();
  const month = text(formData, "month");
  const ownerId = text(formData, "owner_id");
  const templateId = text(formData, "template_id");
  if (!isMonth(month)) fail("Choose a valid budget month.", month || "", ownerId);
  if (!templateId) fail("Choose a template.", month, ownerId);

  const { error } = await supabase.from("budget_templates").delete().eq("id", templateId);
  if (error) fail(error.message, month, ownerId);
  revalidatePath("/budget");
  redirect(`${backPath(month, ownerId)}&success=Budget%20template%20deleted.`);
}
