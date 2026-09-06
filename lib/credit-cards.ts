export type CreditCardLike = {
  opening_balance: number | string | null;
  credit_limit?: number | string | null;
  statement_day?: number | null;
  due_days_after_statement?: number | null;
};

export type CreditCardActivityLike = {
  activity_type: string;
  activity_date?: string | null;
  amount: number | string;
};

export function creditCardImpact(activityType: string, amount: number | string) {
  const value = Number(amount);
  if (activityType === "payment" || activityType === "refund") return -value;
  return value;
}

export function creditCardBalance(
  card: CreditCardLike,
  activities: CreditCardActivityLike[],
  asOfDate?: string,
) {
  let balance = Number(card.opening_balance ?? 0);
  for (const activity of activities) {
    if (asOfDate && activity.activity_date && activity.activity_date > asOfDate) continue;
    balance += creditCardImpact(activity.activity_type, activity.amount);
  }
  return balance;
}

export function availableCredit(card: CreditCardLike, balance: number) {
  return Math.max(Number(card.credit_limit ?? 0) - Math.max(balance, 0), 0);
}

export function utilizationRate(card: CreditCardLike, balance: number) {
  const limit = Number(card.credit_limit ?? 0);
  if (limit <= 0) return 0;
  return (Math.max(balance, 0) / limit) * 100;
}

export function addDaysIso(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonthsIso(dateString: string, delta: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + delta, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function statementPeriodForMonth(statementMonth: string, statementDay: number, dueDays: number) {
  const day = Math.min(Math.max(statementDay || 25, 1), 28);
  const previousMonth = shiftMonth(statementMonth, -1);
  const start = addDaysIso(`${previousMonth}-${String(day).padStart(2, "0")}`, 1);
  const end = `${statementMonth}-${String(day).padStart(2, "0")}`;
  const dueDate = addDaysIso(end, Math.min(Math.max(dueDays || 20, 1), 45));
  return { start, end, dueDate };
}

export function defaultStatementMonth(today: string, statementDay: number, dueDays = 20) {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const lastClosedMonth = day > statementDay ? month : shiftMonth(month, -1);
  const lastClosed = statementPeriodForMonth(lastClosedMonth, statementDay, dueDays);
  if (lastClosed.dueDate >= today) return lastClosedMonth;
  return shiftMonth(lastClosedMonth, 1);
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}
