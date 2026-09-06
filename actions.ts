"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAccount(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("account_type") ?? "").trim();
  const openingBalance = Number(String(formData.get("opening_balance") ?? "0"));

  if (!name) redirect("/accounts?error=Account%20name%20is%20required.");
  if (!["cash", "bank", "ewallet", "savings", "other"].includes(accountType)) redirect("/accounts?error=Choose%20a%20valid%20account%20type.");
  if (!Number.isFinite(openingBalance)) redirect("/accounts?error=Opening%20balance%20must%20be%20a%20number.");

  const { error } = await supabase.from("accounts").insert({
    user_id: userId,
    name,
    account_type: accountType,
    opening_balance: openingBalance,
  });

  if (error) redirect(`/accounts?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  redirect("/accounts?success=Account%20created.");
}
