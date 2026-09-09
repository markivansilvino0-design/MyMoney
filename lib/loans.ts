export type LoanScheduleDraft = {
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function addMonthsIso(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function buildAmortizationSchedule(
  principal: number,
  annualInterestRate: number,
  termMonths: number,
  firstDueDate: string,
): LoanScheduleDraft[] {
  const monthlyRate = annualInterestRate / 100 / 12;
  const exactPayment = monthlyRate > 0
    ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths))
    : principal / termMonths;

  let balance = round2(principal);
  const rows: LoanScheduleDraft[] = [];

  for (let i = 0; i < termMonths; i += 1) {
    const interest = round2(balance * monthlyRate);
    let principalDue = i === termMonths - 1 ? balance : round2(exactPayment - interest);
    principalDue = Math.min(Math.max(principalDue, 0), balance);
    rows.push({
      installmentNo: i + 1,
      dueDate: addMonthsIso(firstDueDate, i),
      principalDue,
      interestDue: interest,
    });
    balance = round2(balance - principalDue);
  }

  return rows;
}

export function loanOutstanding(principal: number | string, payments: Array<{ principal_amount: number | string }>) {
  const paid = payments.reduce((sum, row) => sum + Number(row.principal_amount), 0);
  return Math.max(Number(principal) - paid, 0);
}
