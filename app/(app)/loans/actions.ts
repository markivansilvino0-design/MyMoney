"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAmortizationSchedule } from "@/lib/loans";

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

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function fail(message: string, path = "/loans"): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

async function ownsAccount(supabase: Awaited<ReturnType<typeof createClient>>, id: string | null) {
  if (!id) return false;
  const { data } = await supabase.from("accounts").select("id").eq("id", id).maybeSingle();
  return Boolean(data?.id);
}

async function syncScheduleStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheduleId: string | null,
) {
  if (!scheduleId) return;
  const [{ data: schedule }, { data: payments }] = await Promise.all([
    supabase.from("loan_schedule").select("id,principal_due,interest_due").eq("id", scheduleId).maybeSingle(),
    supabase.from("loan_payments").select("principal_amount,interest_amount").eq("schedule_id", scheduleId),
  ]);
  if (!schedule) return;
  const principalPaid = (payments ?? []).reduce((sum, row) => sum + Number(row.principal_amount), 0);
  const interestPaid = (payments ?? []).reduce((sum, row) => sum + Number(row.interest_amount), 0);
  const due = Number(schedule.principal_due) + Number(schedule.interest_due);
  const paid = principalPaid + interestPaid;
  const status = paid >= due - 0.005 ? "paid" : paid > 0 ? "partial" : "scheduled";
  await supabase.from("loan_schedule").update({ status, updated_at: new Date().toISOString() }).eq("id", scheduleId);
}

async function syncLoanStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  loanId: string,
) {
  const [{ data: loan }, { data: payments }] = await Promise.all([
    supabase.from("loans").select("principal_amount,status").eq("id", loanId).maybeSingle(),
    supabase.from("loan_payments").select("principal_amount").eq("loan_id", loanId),
  ]);
  if (!loan) return;
  const paidPrincipal = (payments ?? []).reduce((sum, row) => sum + Number(row.principal_amount), 0);
  const outstanding = Math.max(Number(loan.principal_amount) - paidPrincipal, 0);
  if (outstanding <= 0.005 && loan.status !== "archived") {
    await supabase.from("loans").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", loanId);
  } else if (outstanding > 0.005 && loan.status === "paid") {
    await supabase.from("loans").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", loanId);
  }
}

export async function createLoan(formData: FormData) {
  const { supabase, userId } = await session();
  const loanType = text(formData, "loan_type");
  const name = text(formData, "name");
  const counterparty = optionalText(formData, "counterparty");
  const principal = numberValue(formData, "principal_amount");
  const annualRate = numberValue(formData, "annual_interest_rate") ?? 0;
  const termMonths = Number(text(formData, "term_months"));
  const startDate = text(formData, "start_date");
  const firstDueDate = text(formData, "first_due_date");
  const fundingAccountId = optionalText(formData, "funding_account_id");
  const recordInitialCash = text(formData, "record_initial_cash") === "on";
  const notes = optionalText(formData, "notes");

  if (!['borrowed','lent'].includes(loanType)) fail("Choose whether you borrowed or lent the money.");
  if (!name) fail("Loan name is required.");
  if (principal === null || principal <= 0) fail("Principal amount must be greater than zero.");
  if (annualRate < 0 || annualRate > 1000) fail("Interest rate must be zero or greater.");
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 360) fail("Term must be between 1 and 360 months.");
  if (!validDate(startDate) || !validDate(firstDueDate)) fail("Choose valid start and first due dates.");
  if (firstDueDate < startDate) fail("First due date cannot be before the loan start date.");
  if (recordInitialCash && !(await ownsAccount(supabase, fundingAccountId))) fail("Choose a valid funding account.");

  const { data: loan, error } = await supabase.from("loans").insert({
    user_id: userId,
    loan_type: loanType,
    name,
    counterparty,
    principal_amount: principal,
    annual_interest_rate: annualRate,
    term_months: termMonths,
    start_date: startDate,
    first_due_date: firstDueDate,
    funding_account_id: fundingAccountId,
    record_initial_cash: recordInitialCash,
    notes,
  }).select("id").single();
  if (error || !loan) fail(error?.message ?? "Unable to create loan.");

  const schedule = buildAmortizationSchedule(principal, annualRate, termMonths, firstDueDate);
  const { error: scheduleError } = await supabase.from("loan_schedule").insert(schedule.map((row) => ({
    user_id: userId,
    loan_id: loan.id,
    installment_no: row.installmentNo,
    due_date: row.dueDate,
    principal_due: row.principalDue,
    interest_due: row.interestDue,
  })));
  if (scheduleError) {
    await supabase.from("loans").delete().eq("id", loan.id);
    fail(scheduleError.message);
  }

  redirect(`/loans/${loan.id}?success=Loan%20created.`);
}

export async function recordLoanPayment(formData: FormData) {
  const { supabase, userId } = await session();
  const loanId = text(formData, "loan_id");
  const back = `/loans/${loanId}`;
  const scheduleId = optionalText(formData, "schedule_id");
  const paymentDate = text(formData, "payment_date");
  const accountId = optionalText(formData, "account_id");
  const principal = numberValue(formData, "principal_amount") ?? 0;
  const interest = numberValue(formData, "interest_amount") ?? 0;
  const notes = optionalText(formData, "notes");

  const { data: loan } = await supabase.from("loans").select("id,principal_amount").eq("id", loanId).maybeSingle();
  if (!loan) fail("Loan not found.");
  if (!validDate(paymentDate)) fail("Choose a valid payment date.", back);
  if (!(await ownsAccount(supabase, accountId))) fail("Choose a valid account.", back);
  if (principal < 0 || interest < 0 || principal + interest <= 0) fail("Payment amount must be greater than zero.", back);

  if (scheduleId) {
    const { data: schedule } = await supabase.from("loan_schedule").select("id").eq("id", scheduleId).eq("loan_id", loanId).maybeSingle();
    if (!schedule) fail("Choose a valid scheduled payment.", back);
  }

  const { data: existingPayments } = await supabase.from("loan_payments").select("principal_amount").eq("loan_id", loanId);
  const outstanding = Math.max(Number(loan.principal_amount) - (existingPayments ?? []).reduce((sum, row) => sum + Number(row.principal_amount), 0), 0);
  if (principal > outstanding + 0.005) fail("Principal payment is greater than the outstanding balance.", back);

  const { error } = await supabase.from("loan_payments").insert({
    user_id: userId,
    loan_id: loanId,
    schedule_id: scheduleId,
    payment_date: paymentDate,
    account_id: accountId,
    principal_amount: principal,
    interest_amount: interest,
    notes,
  });
  if (error) fail(error.message, back);
  await Promise.all([syncScheduleStatus(supabase, scheduleId), syncLoanStatus(supabase, loanId)]);
  redirect(`${back}?success=Payment%20recorded.`);
}

export async function deleteLoanPayment(formData: FormData) {
  const { supabase } = await session();
  const loanId = text(formData, "loan_id");
  const paymentId = text(formData, "payment_id");
  const back = `/loans/${loanId}`;
  const { data: payment } = await supabase.from("loan_payments").select("id,schedule_id").eq("id", paymentId).eq("loan_id", loanId).maybeSingle();
  if (!payment) fail("Payment not found.", back);
  const { error } = await supabase.from("loan_payments").delete().eq("id", paymentId);
  if (error) fail(error.message, back);
  await Promise.all([syncScheduleStatus(supabase, payment.schedule_id), syncLoanStatus(supabase, loanId)]);
  redirect(`${back}?success=Payment%20deleted.`);
}

export async function updateLoan(formData: FormData) {
  const { supabase } = await session();
  const id = text(formData, "id");
  const back = `/loans/${id}`;
  const name = text(formData, "name");
  const counterparty = optionalText(formData, "counterparty");
  const status = text(formData, "status");
  const notes = optionalText(formData, "notes");
  if (!name) fail("Loan name is required.", back);
  if (!['active','paused','paid','archived'].includes(status)) fail("Choose a valid status.", back);
  const { data: loan } = await supabase.from("loans").select("id").eq("id", id).maybeSingle();
  if (!loan) fail("Loan not found.");
  const { error } = await supabase.from("loans").update({ name, counterparty, status, notes, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error.message, back);
  redirect(`${back}?success=Loan%20settings%20saved.`);
}

export async function deleteLoan(formData: FormData) {
  const { supabase } = await session();
  const id = text(formData, "id");
  const back = `/loans/${id}`;
  const [{ data: loan }, { count }] = await Promise.all([
    supabase.from("loans").select("id").eq("id", id).maybeSingle(),
    supabase.from("loan_payments").select("id", { count: "exact", head: true }).eq("loan_id", id),
  ]);
  if (!loan) fail("Loan not found.");
  if ((count ?? 0) > 0) fail("This loan has payment history. Archive it instead of deleting it.", back);
  const { error } = await supabase.from("loans").delete().eq("id", id);
  if (error) fail(error.message, back);
  redirect("/loans?success=Loan%20deleted.");
}
