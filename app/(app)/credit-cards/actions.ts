"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addMonthsIso } from "@/lib/credit-cards";

type OwnTable = "credit_cards" | "accounts" | "categories" | "owners" | "credit_card_installments";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function numberValue(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : null;
}

function positiveAmount(formData: FormData, key = "amount") {
  const value = numberValue(formData, key);
  return value !== null && value > 0 ? value : null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function fail(message: string, path = "/credit-cards"): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

async function owns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: OwnTable,
  id: string | null,
) {
  if (!id) return false;
  const { data } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  return Boolean(data?.id);
}

export async function createCreditCard(formData: FormData) {
  const { supabase, userId } = await session();
  const name = text(formData, "name");
  const issuer = optionalText(formData, "issuer");
  const last4 = optionalText(formData, "last4");
  const creditLimit = numberValue(formData, "credit_limit");
  const openingBalance = numberValue(formData, "opening_balance") ?? 0;
  const statementDay = Number(text(formData, "statement_day"));
  const dueDays = Number(text(formData, "due_days_after_statement"));

  if (!name) fail("Card name is required.");
  if (creditLimit === null || creditLimit < 0) fail("Credit limit cannot be negative.");
  if (openingBalance < 0) fail("Opening balance cannot be negative.");
  if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 28) fail("Statement day must be between 1 and 28.");
  if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 45) fail("Days until due must be between 1 and 45.");
  if (last4 && !/^\d{4}$/.test(last4)) fail("Last 4 digits must contain exactly four numbers.");

  const { error } = await supabase.from("credit_cards").insert({
    user_id: userId,
    name,
    issuer,
    last4,
    credit_limit: creditLimit,
    opening_balance: openingBalance,
    statement_day: statementDay,
    due_days_after_statement: dueDays,
  });
  if (error) fail(error.message);
  redirect("/credit-cards?success=Credit%20card%20added.");
}

export async function updateCreditCard(formData: FormData) {
  const { supabase } = await session();
  const id = text(formData, "id");
  const back = `/credit-cards/${id}`;
  const name = text(formData, "name");
  const issuer = optionalText(formData, "issuer");
  const last4 = optionalText(formData, "last4");
  const creditLimit = numberValue(formData, "credit_limit");
  const openingBalance = numberValue(formData, "opening_balance") ?? 0;
  const statementDay = Number(text(formData, "statement_day"));
  const dueDays = Number(text(formData, "due_days_after_statement"));
  const isActive = text(formData, "is_active") === "true";

  if (!(await owns(supabase, "credit_cards", id))) fail("Card not found.", "/credit-cards");
  if (!name) fail("Card name is required.", back);
  if (creditLimit === null || creditLimit < 0) fail("Credit limit cannot be negative.", back);
  if (openingBalance < 0) fail("Opening balance cannot be negative.", back);
  if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 28) fail("Statement day must be between 1 and 28.", back);
  if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 45) fail("Days until due must be between 1 and 45.", back);
  if (last4 && !/^\d{4}$/.test(last4)) fail("Last 4 digits must contain exactly four numbers.", back);

  const { error } = await supabase.from("credit_cards").update({
    name,
    issuer,
    last4,
    credit_limit: creditLimit,
    opening_balance: openingBalance,
    statement_day: statementDay,
    due_days_after_statement: dueDays,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) fail(error.message, back);
  redirect(`${back}?success=Card%20settings%20saved.`);
}

export async function deleteCreditCard(formData: FormData) {
  const { supabase } = await session();
  const id = text(formData, "id");
  if (!(await owns(supabase, "credit_cards", id))) fail("Card not found.");

  const [{ count: activityCount }, { count: installmentCount }] = await Promise.all([
    supabase.from("credit_card_transactions").select("id", { count: "exact", head: true }).eq("credit_card_id", id),
    supabase.from("credit_card_installments").select("id", { count: "exact", head: true }).eq("credit_card_id", id),
  ]);
  if ((activityCount ?? 0) > 0 || (installmentCount ?? 0) > 0) {
    fail("This card has activity. Mark it Inactive instead of deleting it.", `/credit-cards/${id}`);
  }

  const { error } = await supabase.from("credit_cards").delete().eq("id", id);
  if (error) fail(error.message, `/credit-cards/${id}`);
  redirect("/credit-cards?success=Credit%20card%20deleted.");
}

export async function createCreditCardActivity(formData: FormData) {
  const { supabase, userId } = await session();
  const cardId = text(formData, "credit_card_id");
  const back = `/credit-cards/${cardId}`;
  const activityType = text(formData, "activity_type");
  const activityDate = text(formData, "activity_date");
  const amount = positiveAmount(formData);
  const accountId = optionalText(formData, "account_id");
  const categoryId = optionalText(formData, "category_id");
  const ownerId = optionalText(formData, "owner_id");
  const description = optionalText(formData, "description");
  const notes = optionalText(formData, "notes");
  const needWant = optionalText(formData, "need_want");
  const fixedVariable = optionalText(formData, "fixed_variable");

  if (!(await owns(supabase, "credit_cards", cardId))) fail("Choose a valid credit card.", "/credit-cards");
  if (!["purchase", "payment", "refund", "fee", "interest"].includes(activityType)) fail("Choose a valid card activity type.", back);
  if (!validDate(activityDate)) fail("Choose a valid activity date.", back);
  if (!amount) fail("Amount must be greater than zero.", back);

  const expenseLike = ["purchase", "fee", "interest"].includes(activityType);
  const categoryRequired = expenseLike;
  const [accountOwned, categoryOwned, ownerOwned] = await Promise.all([
    activityType === "payment" ? owns(supabase, "accounts", accountId) : Promise.resolve(true),
    categoryRequired || categoryId ? owns(supabase, "categories", categoryId) : Promise.resolve(true),
    ownerId ? owns(supabase, "owners", ownerId) : Promise.resolve(true),
  ]);
  if (!accountOwned) fail("Choose a valid payment account.", back);
  if (!categoryOwned) fail("Choose a valid expense category.", back);
  if (!ownerOwned) fail("Choose a valid owner.", back);

  const { error } = await supabase.from("credit_card_transactions").insert({
    user_id: userId,
    credit_card_id: cardId,
    activity_date: activityDate,
    activity_type: activityType,
    account_id: activityType === "payment" ? accountId : null,
    category_id: categoryId,
    owner_id: activityType === "payment" ? null : ownerId,
    amount,
    description,
    need_want: expenseLike && ["need", "want"].includes(needWant ?? "") ? needWant : null,
    fixed_variable: expenseLike && ["fixed", "variable"].includes(fixedVariable ?? "") ? fixedVariable : null,
    notes,
  });
  if (error) fail(error.message, back);
  redirect(`${back}?success=Card%20activity%20saved.`);
}

export async function deleteCreditCardActivity(formData: FormData) {
  const { supabase } = await session();
  const cardId = text(formData, "credit_card_id");
  const id = text(formData, "id");
  const back = `/credit-cards/${cardId}`;
  const { data: row } = await supabase.from("credit_card_transactions").select("id,installment_id").eq("id", id).eq("credit_card_id", cardId).maybeSingle();
  if (!row) fail("Card activity not found.", back);
  if (row.installment_id) fail("Installment charges are managed from the installment plan.", back);
  const { error } = await supabase.from("credit_card_transactions").delete().eq("id", id);
  if (error) fail(error.message, back);
  redirect(`${back}?success=Card%20activity%20deleted.`);
}

export async function createInstallmentPlan(formData: FormData) {
  const { supabase, userId } = await session();
  const cardId = text(formData, "credit_card_id");
  const back = `/credit-cards/${cardId}`;
  const purchaseDate = text(formData, "purchase_date");
  const firstChargeDate = text(formData, "first_charge_date");
  const description = text(formData, "description");
  const totalAmount = positiveAmount(formData, "total_amount");
  const termMonths = Number(text(formData, "term_months"));
  const categoryId = optionalText(formData, "category_id");
  const ownerId = optionalText(formData, "owner_id");
  const needWant = optionalText(formData, "need_want");
  const fixedVariable = optionalText(formData, "fixed_variable");
  const notes = optionalText(formData, "notes");

  if (!(await owns(supabase, "credit_cards", cardId))) fail("Choose a valid credit card.", "/credit-cards");
  if (!validDate(purchaseDate) || !validDate(firstChargeDate)) fail("Choose valid purchase and first billing dates.", back);
  if (!description) fail("Installment description is required.", back);
  if (!totalAmount) fail("Total installment amount must be greater than zero.", back);
  if (!Number.isInteger(termMonths) || termMonths < 2 || termMonths > 60) fail("Installment term must be between 2 and 60 months.", back);

  const [categoryOwned, ownerOwned] = await Promise.all([
    owns(supabase, "categories", categoryId),
    ownerId ? owns(supabase, "owners", ownerId) : Promise.resolve(true),
  ]);
  if (!categoryOwned) fail("Choose a valid expense category.", back);
  if (!ownerOwned) fail("Choose a valid owner.", back);

  const { data: plan, error: planError } = await supabase.from("credit_card_installments").insert({
    user_id: userId,
    credit_card_id: cardId,
    purchase_date: purchaseDate,
    first_charge_date: firstChargeDate,
    description,
    total_amount: totalAmount,
    term_months: termMonths,
    category_id: categoryId,
    owner_id: ownerId,
    need_want: ["need", "want"].includes(needWant ?? "") ? needWant : null,
    fixed_variable: ["fixed", "variable"].includes(fixedVariable ?? "") ? fixedVariable : null,
    notes,
  }).select("id").single();
  if (planError || !plan) fail(planError?.message ?? "Could not create installment plan.", back);

  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / termMonths);
  const extraCents = totalCents - baseCents * termMonths;
  const schedule = Array.from({ length: termMonths }, (_, index) => ({
    user_id: userId,
    credit_card_id: cardId,
    activity_date: addMonthsIso(firstChargeDate, index),
    activity_type: "purchase",
    category_id: categoryId,
    owner_id: ownerId,
    amount: (baseCents + (index < extraCents ? 1 : 0)) / 100,
    description: `${description} · ${index + 1}/${termMonths}`,
    need_want: ["need", "want"].includes(needWant ?? "") ? needWant : null,
    fixed_variable: ["fixed", "variable"].includes(fixedVariable ?? "") ? fixedVariable : null,
    installment_id: plan.id,
    installment_sequence: index + 1,
    installment_total: termMonths,
    notes,
  }));

  const { error: scheduleError } = await supabase.from("credit_card_transactions").insert(schedule);
  if (scheduleError) {
    await supabase.from("credit_card_installments").delete().eq("id", plan.id);
    fail(scheduleError.message, back);
  }

  redirect(`${back}?success=Installment%20schedule%20created.`);
}

export async function cancelFutureInstallments(formData: FormData) {
  const { supabase } = await session();
  const cardId = text(formData, "credit_card_id");
  const installmentId = text(formData, "installment_id");
  const today = text(formData, "today");
  const back = `/credit-cards/${cardId}`;

  if (!(await owns(supabase, "credit_card_installments", installmentId))) fail("Installment plan not found.", back);
  if (!validDate(today)) fail("Invalid current date.", back);

  const { error: deleteError } = await supabase.from("credit_card_transactions").delete().eq("installment_id", installmentId).gt("activity_date", today);
  if (deleteError) fail(deleteError.message, back);
  const { error } = await supabase.from("credit_card_installments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", installmentId);
  if (error) fail(error.message, back);
  redirect(`${back}?success=Future%20installment%20charges%20cancelled.`);
}
