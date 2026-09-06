import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { TransactionForm } from "@/components/transaction-form";
import { deleteMoneyEntry } from "../../actions";

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function TransactionDetailPage({ params, searchParams }: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { kind, id } = await params;
  const notices = await searchParams;
  if (!["tx", "sv"].includes(kind)) notFound();

  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }, { data: owners }, { data: goals }] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type,is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("categories").select("id,name,category_type").eq("is_active", true).order("category_type").order("name"),
    supabase.from("owners").select("id,name,is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    supabase.from("savings_goals").select("id,name,target_amount,current_amount,status").order("name"),
  ]);

  const accountRows = accounts ?? [];
  const categoryRows = (categories ?? []) as { id: string; name: string; category_type: "income" | "expense" }[];
  const ownerRows = owners ?? [];
  const goalRows = goals ?? [];
  const accountMap = new Map(accountRows.map((account) => [account.id, account.name]));
  const categoryMap = new Map(categoryRows.map((category) => [category.id, category.name]));
  const ownerMap = new Map(ownerRows.map((owner) => [owner.id, owner.name]));
  const goalMap = new Map(goalRows.map((goal) => [goal.id, goal.name]));

  let initial;
  let title;
  let subtitle;
  let summary: { label: string; value: string }[];

  if (kind === "sv") {
    const { data } = await supabase.from("savings_contributions").select("id,contribution_date,from_account_id,to_account_id,savings_goal_id,entry_type,saving_mode,amount,description,notes").eq("id", id).maybeSingle();
    if (!data) notFound();
    const withdrawal = data.entry_type === "withdrawal";
    initial = {
      id: data.id,
      kind: "sv" as const,
      transaction_type: "savings" as const,
      transaction_date: data.contribution_date,
      account_id: data.from_account_id,
      to_account_id: data.to_account_id,
      savings_goal_id: data.savings_goal_id,
      savings_entry_type: (data.entry_type ?? "deposit") as "deposit" | "withdrawal",
      saving_mode: (data.saving_mode ?? "earmark") as "earmark" | "transfer",
      amount: Number(data.amount),
      description: data.description,
      notes: data.notes,
    };
    title = withdrawal ? "Savings withdrawal" : "Savings deposit";
    subtitle = data.description || data.notes || goalMap.get(data.savings_goal_id) || "Savings";
    const from = accountMap.get(data.from_account_id ?? "") ?? "—";
    const to = accountMap.get(data.to_account_id ?? "") ?? "—";
    summary = [
      { label: "Amount", value: money(Number(data.amount)) },
      { label: "Goal", value: goalMap.get(data.savings_goal_id) ?? "—" },
      { label: "Mode", value: data.saving_mode === "transfer" ? "Account transfer" : "Earmark only" },
      { label: "Account", value: data.saving_mode === "transfer" ? `${from} → ${to}` : from },
      { label: "Date", value: data.contribution_date },
    ];
  } else {
    const { data } = await supabase.from("transactions").select("id,transaction_date,transaction_type,account_id,to_account_id,category_id,owner_id,amount,description,need_want,fixed_variable,notes").eq("id", id).maybeSingle();
    if (!data) notFound();
    initial = {
      id: data.id,
      kind: "tx" as const,
      transaction_type: data.transaction_type as "income" | "expense" | "transfer",
      transaction_date: data.transaction_date,
      account_id: data.account_id,
      to_account_id: data.to_account_id,
      category_id: data.category_id,
      owner_id: data.owner_id,
      amount: Number(data.amount),
      description: data.description,
      need_want: data.need_want,
      fixed_variable: data.fixed_variable,
      notes: data.notes,
    };
    title = data.transaction_type.charAt(0).toUpperCase() + data.transaction_type.slice(1);
    subtitle = data.description || "Transaction details";
    summary = [
      { label: "Amount", value: money(Number(data.amount)) },
      { label: data.transaction_type === "transfer" ? "From" : "Account", value: accountMap.get(data.account_id ?? "") ?? "—" },
      ...(data.transaction_type === "transfer" ? [{ label: "To", value: accountMap.get(data.to_account_id ?? "") ?? "—" }] : []),
      ...(data.transaction_type !== "transfer" ? [{ label: "Category", value: categoryMap.get(data.category_id ?? "") ?? "—" }, { label: "Owner", value: ownerMap.get(data.owner_id ?? "") ?? "—" }] : []),
      { label: "Date", value: data.transaction_date },
    ];
  }

  return (
    <main className="main">
      <div className="page-heading"><div><Link href="/transactions" className="back-link">← Transactions</Link><h2>{title}</h2><p>{subtitle}</p></div></div>

      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="detail-summary">
        {summary.map((item) => <div className="stat-card" key={item.label}><div className="stat-label">{item.label}</div><div className="detail-value">{item.value}</div></div>)}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><div><h3>Edit transaction</h3><p className="muted">Changes update your dashboard, accounts and savings goal immediately.</p></div></div>
        <TransactionForm
          accounts={accountRows}
          categories={categoryRows}
          owners={ownerRows}
          goals={goalRows.map((goal) => ({ ...goal, target_amount: Number(goal.target_amount), current_amount: Number(goal.current_amount) }))}
          today={manilaToday()}
          initial={initial}
        />
      </section>

      <section className="danger-zone">
        <div><strong>Delete transaction</strong><p>This removes the entry from MyMoney. Account and savings totals will recalculate automatically.</p></div>
        <form action={deleteMoneyEntry}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><button className="danger-btn" type="submit">Delete</button></form>
      </section>
    </main>
  );
}
