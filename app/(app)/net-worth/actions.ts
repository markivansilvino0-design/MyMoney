"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNetWorthSummary, manilaToday } from "@/lib/net-worth";

export async function saveNetWorthSnapshot(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const snapshotDate = String(formData.get("snapshot_date") ?? manilaToday());
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) redirect("/net-worth?error=Choose%20a%20valid%20snapshot%20date.");

  const summary = await loadNetWorthSummary(supabase, snapshotDate);
  const { error } = await supabase.from("net_worth_snapshots").upsert({
    user_id: userId,
    snapshot_date: snapshotDate,
    account_assets: summary.accountAssets,
    receivables: summary.receivables,
    total_assets: summary.totalAssets,
    credit_card_debt: summary.creditCardDebt,
    loan_debt: summary.loanDebt,
    account_overdrafts: summary.accountOverdrafts,
    total_liabilities: summary.totalLiabilities,
    net_worth: summary.netWorth,
    notes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,snapshot_date" });

  if (error) redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  redirect("/net-worth?success=Net%20worth%20snapshot%20saved.");
}

export async function deleteNetWorthSnapshot(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("net_worth_snapshots").delete().eq("id", id);
  if (error) redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  redirect("/net-worth?success=Snapshot%20deleted.");
}
