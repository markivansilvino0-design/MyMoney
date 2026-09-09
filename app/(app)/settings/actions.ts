"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function back(kind: "success" | "error", message: string): never {
  redirect(`/settings?${kind}=${encodeURIComponent(message)}`);
}

async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

function cleanName(value: string, label: string) {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name) back("error", `${label} name is required.`);
  if (name.length > 80) back("error", `${label} name must be 80 characters or fewer.`);
  return name;
}

function friendlyDbError(message: string) {
  if (/duplicate key|unique constraint/i.test(message)) return "That name already exists.";
  return message;
}

export async function createCategory(formData: FormData) {
  const { supabase, userId } = await getUser();
  const name = cleanName(text(formData, "name"), "Category");
  const categoryType = text(formData, "category_type");
  if (!['income', 'expense'].includes(categoryType)) back("error", "Choose Income or Expense for the category type.");

  const { error } = await supabase.from("categories").insert({
    user_id: userId,
    name,
    category_type: categoryType,
    is_active: true,
  });
  if (error) back("error", friendlyDbError(error.message));
  back("success", `${name} category added.`);
}

export async function renameCategory(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const name = cleanName(text(formData, "name"), "Category");
  const categoryType = text(formData, "category_type");
  if (!id) back("error", "Missing category.");
  if (!["income", "expense"].includes(categoryType)) back("error", "Choose Income or Expense for the category type.");

  const { data: current } = await supabase.from("categories").select("id,category_type").eq("id", id).maybeSingle();
  if (!current) back("error", "Category not found.");

  if (current.category_type !== categoryType) {
    const [transactions, budgets, cardActivity, installments, recurring] = await Promise.all([
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("category_id", id),
      supabase.from("budgets").select("id", { count: "exact", head: true }).eq("category_id", id),
      supabase.from("credit_card_transactions").select("id", { count: "exact", head: true }).eq("category_id", id),
      supabase.from("credit_card_installments").select("id", { count: "exact", head: true }).eq("category_id", id),
      supabase.from("recurring_rules").select("id", { count: "exact", head: true }).eq("category_id", id),
    ]);
    const used = [transactions, budgets, cardActivity, installments, recurring].some((result) => (result.count ?? 0) > 0);
    if (used) back("error", "A category already used by financial records cannot be changed between Income and Expense. Rename or deactivate it instead.");
  }

  const { error } = await supabase.from("categories").update({ name, category_type: categoryType }).eq("id", id);
  if (error) back("error", friendlyDbError(error.message));
  back("success", "Category updated.");
}

export async function toggleCategory(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const nextActive = text(formData, "next_active") === "true";
  if (!id) back("error", "Missing category.");

  const { error } = await supabase.from("categories").update({ is_active: nextActive }).eq("id", id);
  if (error) back("error", error.message);
  back("success", nextActive ? "Category reactivated." : "Category deactivated. Existing history is unchanged.");
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  if (!id) back("error", "Missing category.");

  const [transactions, budgets, cardActivity, installments, recurring] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("category_id", id),
    supabase.from("budgets").select("id", { count: "exact", head: true }).eq("category_id", id),
    supabase.from("credit_card_transactions").select("id", { count: "exact", head: true }).eq("category_id", id),
    supabase.from("credit_card_installments").select("id", { count: "exact", head: true }).eq("category_id", id),
    supabase.from("recurring_rules").select("id", { count: "exact", head: true }).eq("category_id", id),
  ]);

  const used = [transactions, budgets, cardActivity, installments, recurring].some((result) => (result.count ?? 0) > 0);
  if (used) back("error", "This category is already used by financial records. Deactivate it instead so historical reports stay intact.");

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) back("error", error.message);
  back("success", "Unused category deleted.");
}

export async function createOwner(formData: FormData) {
  const { supabase, userId } = await getUser();
  const name = cleanName(text(formData, "name"), "Owner");

  const { error } = await supabase.from("owners").insert({
    user_id: userId,
    name,
    is_default: false,
    is_active: true,
  });
  if (error) back("error", friendlyDbError(error.message));
  back("success", `${name} added to Owner / Charge to.`);
}

export async function renameOwner(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const name = cleanName(text(formData, "name"), "Owner");
  if (!id) back("error", "Missing owner.");

  const { error } = await supabase.from("owners").update({ name }).eq("id", id);
  if (error) back("error", friendlyDbError(error.message));
  back("success", "Owner updated.");
}

export async function toggleOwner(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const nextActive = text(formData, "next_active") === "true";
  if (!id) back("error", "Missing owner.");

  const { data: owner } = await supabase.from("owners").select("id,is_default").eq("id", id).maybeSingle();
  if (!owner) back("error", "Owner not found.");
  if (!nextActive && owner.is_default) back("error", "Set another owner as default before deactivating this one.");

  const { error } = await supabase.from("owners").update({ is_active: nextActive }).eq("id", id);
  if (error) back("error", error.message);
  back("success", nextActive ? "Owner reactivated." : "Owner deactivated. Existing history is unchanged.");
}

export async function setDefaultOwner(formData: FormData) {
  const { supabase, userId } = await getUser();
  const id = text(formData, "id");
  if (!id) back("error", "Missing owner.");

  const { data: owner } = await supabase.from("owners").select("id").eq("id", id).maybeSingle();
  if (!owner) back("error", "Owner not found.");

  const { error: clearError } = await supabase.from("owners").update({ is_default: false }).eq("user_id", userId);
  if (clearError) back("error", clearError.message);
  const { error } = await supabase.from("owners").update({ is_default: true, is_active: true }).eq("id", id);
  if (error) back("error", error.message);
  back("success", "Default owner updated.");
}

export async function deleteOwner(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  if (!id) back("error", "Missing owner.");

  const { data: owner } = await supabase.from("owners").select("id,is_default").eq("id", id).maybeSingle();
  if (!owner) back("error", "Owner not found.");
  if (owner.is_default) back("error", "The default owner cannot be deleted. Set another owner as default first.");

  const [transactions, cardActivity, installments, recurring] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("owner_id", id),
    supabase.from("credit_card_transactions").select("id", { count: "exact", head: true }).eq("owner_id", id),
    supabase.from("credit_card_installments").select("id", { count: "exact", head: true }).eq("owner_id", id),
    supabase.from("recurring_rules").select("id", { count: "exact", head: true }).eq("owner_id", id),
  ]);
  const used = [transactions, cardActivity, installments, recurring].some((result) => (result.count ?? 0) > 0);
  if (used) back("error", "This owner is already used by financial records. Deactivate it instead so historical reports stay intact.");

  const { error } = await supabase.from("owners").delete().eq("id", id);
  if (error) back("error", error.message);
  back("success", "Unused owner deleted.");
}
