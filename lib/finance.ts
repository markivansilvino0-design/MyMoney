export type AccountBalanceRow = {
  id: string;
  opening_balance: number | string | null;
};

export type MoneyTransactionRow = {
  transaction_type: string;
  account_id: string | null;
  to_account_id: string | null;
  amount: number | string;
};

export type SavingsActivityRow = {
  from_account_id: string | null;
  to_account_id?: string | null;
  saving_mode?: string | null;
  amount: number | string;
};

export type CreditCardPaymentRow = {
  activity_type: string;
  account_id: string | null;
  amount: number | string;
};

export type LoanFundingRow = {
  loan_type: string;
  funding_account_id: string | null;
  principal_amount: number | string;
  record_initial_cash?: boolean | null;
};

export type LoanRelationRow = {
  loan_type?: string | null;
};

export type LoanPaymentRow = {
  account_id: string | null;
  principal_amount: number | string;
  interest_amount: number | string;
  // Supabase can infer embedded relations as either a single object or an array
  // depending on the generated relationship metadata, so accept both shapes.
  loans?: LoanRelationRow | LoanRelationRow[] | null;
  loan_type?: string | null;
};

export function savingsGoalImpact(entryType: string | null | undefined, amount: number | string) {
  const value = Number(amount);
  return entryType === "withdrawal" ? -value : value;
}

export function accountBalance(
  account: AccountBalanceRow,
  transactions: MoneyTransactionRow[],
  savingsEntries: SavingsActivityRow[],
  cardActivities: CreditCardPaymentRow[] = [],
  loans: LoanFundingRow[] = [],
  loanPayments: LoanPaymentRow[] = [],
) {
  let balance = Number(account.opening_balance ?? 0);

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    if (transaction.transaction_type === "income" && transaction.account_id === account.id) balance += amount;
    if (transaction.transaction_type === "expense" && transaction.account_id === account.id) balance -= amount;
    if (transaction.transaction_type === "transfer" && transaction.account_id === account.id) balance -= amount;
    if (transaction.transaction_type === "transfer" && transaction.to_account_id === account.id) balance += amount;
  }

  for (const entry of savingsEntries) {
    if (entry.saving_mode !== "transfer") continue;
    const amount = Number(entry.amount);
    if (entry.from_account_id === account.id) balance -= amount;
    if (entry.to_account_id === account.id) balance += amount;
  }

  for (const activity of cardActivities) {
    if (activity.activity_type === "payment" && activity.account_id === account.id) {
      balance -= Number(activity.amount);
    }
  }

  for (const loan of loans) {
    if (!loan.record_initial_cash || loan.funding_account_id !== account.id) continue;
    const principal = Number(loan.principal_amount);
    if (loan.loan_type === "borrowed") balance += principal;
    if (loan.loan_type === "lent") balance -= principal;
  }

  for (const payment of loanPayments) {
    if (payment.account_id !== account.id) continue;
    const amount = Number(payment.principal_amount) + Number(payment.interest_amount);
    const relation = Array.isArray(payment.loans) ? payment.loans[0] : payment.loans;
    const loanType = payment.loan_type ?? relation?.loan_type ?? "";
    if (loanType === "borrowed") balance -= amount;
    if (loanType === "lent") balance += amount;
  }

  return balance;
}
