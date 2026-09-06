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

export function savingsGoalImpact(entryType: string | null | undefined, amount: number | string) {
  const value = Number(amount);
  return entryType === "withdrawal" ? -value : value;
}

export function accountBalance(
  account: AccountBalanceRow,
  transactions: MoneyTransactionRow[],
  savingsEntries: SavingsActivityRow[],
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

  return balance;
}
