"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const accountTypes = ["cash", "bank", "ewallet", "savings", "investment", "other"];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string, path = "/accounts"): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export async function createAccount(formData: FormData) {
  const { supabase, userId } = await getUser();
  const name = text(formData, "name");
  const accountType = text(formData, "account_type");
  const openingBalance = Number(text(formData, "opening_balance") || "0");

  if (!name) fail("Account name is required.");
  if (!accountTypes.includes(accountType)) fail("Choose a valid account type.");
  if (!Number.isFinite(openingBalance)) fail("Opening balance must be a number.");

  const { error } = await supabase.from("accounts").insert({
    user_id: userId,
    name,
    account_type: accountType,
    opening_balance: openingBalance,
  });

  if (error) fail(error.message);
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  redirect("/accounts?success=Account%20created.");
}

export async function updateAccount(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const backTo = `/accounts/${id}`;
  const name = text(formData, "name");
  const accountType = text(formData, "account_type");
  const openingBalance = Number(text(formData, "opening_balance") || "0");
  const isActive = text(formData, "is_active") === "true";

  if (!id) fail("Missing account ID.");
  if (!name) fail("Account name is required.", backTo);
  if (!accountTypes.includes(accountType)) fail("Choose a valid account type.", backTo);
  if (!Number.isFinite(openingBalance)) fail("Opening balance must be a number.", backTo);

  const { error } = await supabase
    .from("accounts")
    .update({
      name,
      account_type: accountType,
      opening_balance: openingBalance,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) fail(error.message, backTo);
  revalidatePath("/accounts");
  revalidatePath(backTo);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect(`${backTo}?success=Account%20updated.`);
}

export async function deleteAccount(formData: FormData) {
  const { supabase } = await getUser();
  const id = text(formData, "id");
  const backTo = `/accounts/${id}`;
  if (!id) fail("Missing account ID.");

  const [{ data: txRows }, { data: savingsRows }] = await Promise.all([
    supabase.from("transactions").select("id").or(`account_id.eq.${id},to_account_id.eq.${id}`).limit(1),
    supabase.from("savings_contributions").select("id").or(`from_account_id.eq.${id},to_account_id.eq.${id}`).limit(1),
  ]);

  if ((txRows?.length ?? 0) > 0 || (savingsRows?.length ?? 0) > 0) {
    fail("This account has transaction history. Set it to Inactive instead of deleting it.", backTo);
  }

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) fail(error.message, backTo);

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  redirect("/accounts?success=Account%20deleted.");
}
