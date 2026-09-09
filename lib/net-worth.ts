import { accountBalance, savingsGoalImpact } from "@/lib/finance";
import { creditCardBalance } from "@/lib/credit-cards";
import { createClient } from "@/lib/supabase/server";

export type NetWorthSummary = {
  accountAssets: number;
  accountOverdrafts: number;
  receivables: number;
  totalAssets: number;
  creditCardDebt: number;
  loanDebt: number;
  totalLiabilities: number;
  netWorth: number;
  incomeThisMonth: number;
  expensesThisMonth: number;
  netSavingsThisMonth: number;
  savingsRate: number;
  expenseRate: number;
  debtToAssetRatio: number;
  emergencyFund: number;
  emergencyCoverageMonths: number | null;
  accountRows: Array<{ id: string; name: string; account_type: string; balance: number }>;
  cardRows: Array<{ id: string; name: string; balance: number }>;
  borrowedRows: Array<{ id: string; name: string; outstanding: number }>;
  receivableRows: Array<{ id: string; name: string; outstanding: number }>;
};

export function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function loadNetWorthSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  today = manilaToday(),
): Promise<NetWorthSummary> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const [
    { data: accounts },
    { data: transactions },
    { data: savings },
    { data: cardActivities },
    { data: cards },
    { data: loans },
    { data: loanPayments },
    { data: goals },
  ] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type,opening_balance,is_active").order("name"),
    supabase.from("transactions").select("transaction_type,account_id,to_account_id,amount,transaction_date").lte("transaction_date", today),
    supabase.from("savings_contributions").select("from_account_id,to_account_id,saving_mode,amount,entry_type,contribution_date").lte("contribution_date", today),
    supabase.from("credit_card_transactions").select("credit_card_id,activity_type,account_id,amount,activity_date").lte("activity_date", today),
    supabase.from("credit_cards").select("id,name,opening_balance,is_active").order("name"),
    supabase.from("loans").select("id,name,loan_type,principal_amount,funding_account_id,record_initial_cash,status").in("status", ["active", "paused", "paid"]),
    supabase.from("loan_payments").select("loan_id,account_id,principal_amount,interest_amount,payment_date,loans(loan_type)").lte("payment_date", today),
    supabase.from("savings_goals").select("id,name,current_amount,status").eq("status", "active"),
  ]);

  const transactionRows = transactions ?? [];
  const savingsRows = savings ?? [];
  const loanRows = loans ?? [];
  const loanPaymentRows = loanPayments ?? [];
  const cardActivityRows = cardActivities ?? [];

  const accountRows = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    account_type: account.account_type,
    balance: accountBalance(
      account,
      transactionRows,
      savingsRows,
      cardActivityRows.filter((row) => row.activity_type === "payment"),
      loanRows,
      loanPaymentRows,
    ),
  }));

  const accountAssets = accountRows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
  const accountOverdrafts = accountRows.reduce((sum, row) => sum + Math.max(-row.balance, 0), 0);

  const paymentsByLoan = new Map<string, number>();
  for (const payment of loanPaymentRows) {
    paymentsByLoan.set(payment.loan_id, (paymentsByLoan.get(payment.loan_id) ?? 0) + Number(payment.principal_amount));
  }
  const loanPositionRows = loanRows.map((loan) => ({
    id: loan.id,
    name: loan.name,
    loan_type: loan.loan_type,
    outstanding: Math.max(Number(loan.principal_amount) - (paymentsByLoan.get(loan.id) ?? 0), 0),
  }));
  const borrowedRows = loanPositionRows.filter((row) => row.loan_type === "borrowed" && row.outstanding > 0.005);
  const receivableRows = loanPositionRows.filter((row) => row.loan_type === "lent" && row.outstanding > 0.005);
  const loanDebt = borrowedRows.reduce((sum, row) => sum + row.outstanding, 0);
  const receivables = receivableRows.reduce((sum, row) => sum + row.outstanding, 0);

  const cardRows = (cards ?? []).map((card) => ({
    id: card.id,
    name: card.name,
    balance: creditCardBalance(card, cardActivityRows.filter((row) => row.credit_card_id === card.id), today),
  }));
  const creditCardDebt = cardRows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);

  const totalAssets = accountAssets + receivables;
  const totalLiabilities = accountOverdrafts + creditCardDebt + loanDebt;
  const netWorth = totalAssets - totalLiabilities;

  const monthTransactions = transactionRows.filter((row) => row.transaction_date >= monthStart);
  const monthSavings = savingsRows.filter((row) => row.contribution_date >= monthStart);
  const monthCards = cardActivityRows.filter((row) => row.activity_date >= monthStart);
  const monthLoanPayments = loanPaymentRows.filter((row) => row.payment_date >= monthStart);

  const cashIncome = monthTransactions.filter((row) => row.transaction_type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const cashExpenses = monthTransactions.filter((row) => row.transaction_type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const cardExpenses = monthCards.reduce((sum, row) => {
    const amount = Number(row.amount);
    if (["purchase", "fee", "interest"].includes(row.activity_type)) return sum + amount;
    if (row.activity_type === "refund") return sum - amount;
    return sum;
  }, 0);
  const loanInterestIncome = monthLoanPayments.reduce((sum, row) => {
    const relation = Array.isArray(row.loans) ? row.loans[0] : row.loans;
    return relation?.loan_type === "lent" ? sum + Number(row.interest_amount) : sum;
  }, 0);
  const loanInterestExpense = monthLoanPayments.reduce((sum, row) => {
    const relation = Array.isArray(row.loans) ? row.loans[0] : row.loans;
    return relation?.loan_type === "borrowed" ? sum + Number(row.interest_amount) : sum;
  }, 0);
  const incomeThisMonth = cashIncome + loanInterestIncome;
  const expensesThisMonth = cashExpenses + cardExpenses + loanInterestExpense;
  const netSavingsThisMonth = monthSavings.reduce((sum, row) => sum + savingsGoalImpact(row.entry_type, row.amount), 0);
  const savingsRate = incomeThisMonth > 0 ? (netSavingsThisMonth / incomeThisMonth) * 100 : 0;
  const expenseRate = incomeThisMonth > 0 ? (expensesThisMonth / incomeThisMonth) * 100 : 0;
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : (totalLiabilities > 0 ? 100 : 0);

  const emergency = (goals ?? []).find((goal) => goal.name.toLowerCase().includes("emergency"));
  const emergencyFund = Number(emergency?.current_amount ?? 0);
  const emergencyCoverageMonths = expensesThisMonth > 0 ? emergencyFund / expensesThisMonth : null;

  return {
    accountAssets,
    accountOverdrafts,
    receivables,
    totalAssets,
    creditCardDebt,
    loanDebt,
    totalLiabilities,
    netWorth,
    incomeThisMonth,
    expensesThisMonth,
    netSavingsThisMonth,
    savingsRate,
    expenseRate,
    debtToAssetRatio,
    emergencyFund,
    emergencyCoverageMonths,
    accountRows,
    cardRows,
    borrowedRows,
    receivableRows,
  };
}
