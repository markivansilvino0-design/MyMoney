import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { RecurringRuleForm } from "@/components/recurring-rule-form";
import {
  postAllDueRecurring,
  postRecurringOccurrence,
  refreshRecurringSchedule,
  setRecurringRuleStatus,
  skipRecurringOccurrence,
} from "./actions";

type Params = Promise<{ month?: string; success?: string; error?: string }>;

type Rule = {
  id: string;
  name: string;
  rule_type: string;
  frequency: string;
  amount: number | string;
  start_date: string;
  end_date: string | null;
  auto_post: boolean;
  status: string;
  description: string | null;
};

type Occurrence = {
  id: string;
  recurring_rule_id: string;
  due_date: string;
  amount: number | string;
  status: string;
  posted_kind: string | null;
};

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function manilaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

function normalizeMonth(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : manilaMonth();
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function frequencyLabel(value: string) {
  return value === "biweekly" ? "Every 2 weeks" : value.charAt(0).toUpperCase() + value.slice(1);
}

function typeLabel(value: string) {
  return ({ income: "Income", expense: "Expense", transfer: "Transfer", savings: "Savings", card_purchase: "Card charge", card_payment: "Card payment" } as Record<string, string>)[value] ?? value;
}

function calendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(Date.UTC(year, monthNumber - 1, 1 - first.getUTCDay()));
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + index);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return { iso, day: d.getUTCDate(), inMonth: d.getUTCMonth() === monthNumber - 1 };
  });
}

export default async function RecurringPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const month = normalizeMonth(params.month);
  const today = manilaToday();
  const sevenDays = addDays(today, 7);
  const monthStart = `${month}-01`;
  const end = monthEnd(month);
  const supabase = await createClient();

  const [
    { data: accounts },
    { data: categories },
    { data: owners },
    { data: goals },
    { data: cards },
    { data: rulesData },
    { data: monthOccurrencesData },
    { data: dueData },
    { data: upcomingData },
  ] = await Promise.all([
    supabase.from("accounts").select("id,name,account_type,is_active").eq("is_active", true).order("name"),
    supabase.from("categories").select("id,name,category_type").eq("is_active", true).order("name"),
    supabase.from("owners").select("id,name,is_default").eq("is_active", true).order("name"),
    supabase.from("savings_goals").select("id,name,status").eq("status", "active").order("name"),
    supabase.from("credit_cards").select("id,name,issuer,last4,is_active").eq("is_active", true).order("name"),
    supabase.from("recurring_rules").select("id,name,rule_type,frequency,amount,start_date,end_date,auto_post,status,description").order("created_at", { ascending: false }),
    supabase.from("recurring_occurrences").select("id,recurring_rule_id,due_date,amount,status,posted_kind").gte("due_date", monthStart).lte("due_date", end).order("due_date"),
    supabase.from("recurring_occurrences").select("id,recurring_rule_id,due_date,amount,status,posted_kind").eq("status", "scheduled").lte("due_date", today).order("due_date"),
    supabase.from("recurring_occurrences").select("id,recurring_rule_id,due_date,amount,status,posted_kind").eq("status", "scheduled").gt("due_date", today).lte("due_date", sevenDays).order("due_date"),
  ]);

  const rules = (rulesData ?? []) as Rule[];
  const visibleRules = rules.filter((rule) => rule.status !== "archived");
  const monthOccurrences = (monthOccurrencesData ?? []) as Occurrence[];
  const dueRaw = (dueData ?? []) as Occurrence[];
  const upcomingRaw = (upcomingData ?? []) as Occurrence[];
  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));
  const due = dueRaw.filter((occurrence) => ruleMap.get(occurrence.recurring_rule_id)?.status === "active");
  const upcoming = upcomingRaw.filter((occurrence) => ruleMap.get(occurrence.recurring_rule_id)?.status === "active");

  const activeMonthOccurrences = monthOccurrences.filter((occurrence) => occurrence.status !== "skipped");
  const recurringIncome = activeMonthOccurrences.reduce((sum, occurrence) => ruleMap.get(occurrence.recurring_rule_id)?.rule_type === "income" ? sum + Number(occurrence.amount) : sum, 0);
  const recurringBills = activeMonthOccurrences.reduce((sum, occurrence) => ["expense", "card_purchase"].includes(ruleMap.get(occurrence.recurring_rule_id)?.rule_type ?? "") ? sum + Number(occurrence.amount) : sum, 0);
  const calendar = calendarDays(month);
  const occurrenceMap = new Map<string, Occurrence[]>();
  for (const occurrence of monthOccurrences) occurrenceMap.set(occurrence.due_date, [...(occurrenceMap.get(occurrence.due_date) ?? []), occurrence]);

  return (
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">Plan ahead</div><h2>Recurring</h2><p>Track repeating income, bills, subscriptions, savings, transfers, and card payments.</p></div>
        <div className="heading-actions">
          <form action={refreshRecurringSchedule}><button className="secondary-btn" type="submit">Refresh schedule</button></form>
          {due.length > 0 && <form action={postAllDueRecurring}><button className="primary-btn" type="submit">Post all due ({due.length})</button></form>}
        </div>
      </div>

      {params.error && <div className="notice error page-notice">{params.error}</div>}
      {params.success && <div className="notice success page-notice">{params.success}</div>}

      <section className="cards recurring-stats">
        <div className="stat-card stat-expense"><div className="stat-label">Due / overdue</div><div className={`stat-value ${due.length ? "negative" : ""}`}>{due.length}</div><div className="stat-foot">Waiting for confirmation or auto-post</div></div>
        <div className="stat-card"><div className="stat-label">Next 7 days</div><div className="stat-value">{upcoming.length}</div><div className="stat-foot">Upcoming scheduled items</div></div>
        <div className="stat-card stat-income"><div className="stat-label">Recurring income</div><div className="stat-value positive">{money(recurringIncome)}</div><div className="stat-foot">Expected in {monthLabel(month)}</div></div>
        <div className="stat-card stat-card-accent"><div className="stat-label">Recurring bills</div><div className="stat-value negative">{money(recurringBills)}</div><div className="stat-foot">Expenses + recurring card charges</div></div>
      </section>

      {(due.length > 0 || upcoming.length > 0) && <section className="panel recurring-due-panel">
        <div className="section-heading"><div><h3>Due & upcoming</h3><p className="muted">Manual items wait here until you post or skip them. Auto-post items are processed by the daily Cron job when enabled.</p></div></div>
        <div className="recurring-due-list">
          {[...due, ...upcoming].map((occurrence) => {
            const rule = ruleMap.get(occurrence.recurring_rule_id);
            if (!rule) return null;
            const isDue = occurrence.due_date <= today;
            return <article className={`recurring-due-row ${isDue ? "is-due" : ""}`} key={occurrence.id}>
              <div className="recurring-date-chip"><strong>{occurrence.due_date.slice(8, 10)}</strong><span>{new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(`${occurrence.due_date}T00:00:00Z`))}</span></div>
              <div className="recurring-due-copy"><div className="recurring-rule-title"><strong>{rule.name}</strong><span className={`type-badge recurring-type-${rule.rule_type}`}>{typeLabel(rule.rule_type)}</span>{rule.auto_post && <span className="status-badge status-active">Auto</span>}</div><span className="muted">{frequencyLabel(rule.frequency)} · {isDue ? (occurrence.due_date < today ? "Overdue" : "Due today") : "Upcoming"}</span></div>
              <strong className="recurring-due-amount">{money(occurrence.amount)}</strong>
              {isDue ? <div className="recurring-row-actions"><form action={postRecurringOccurrence}><input type="hidden" name="id" value={occurrence.id} /><button className="primary-btn compact-btn" type="submit">Post</button></form><form action={skipRecurringOccurrence}><input type="hidden" name="id" value={occurrence.id} /><button className="secondary-btn compact-btn" type="submit">Skip</button></form></div> : <span className="muted recurring-upcoming-label">Scheduled</span>}
            </article>;
          })}
        </div>
      </section>}

      <section className="grid-2 recurring-create-grid">
        <div className="panel recurring-create-panel">
          <div className="section-heading"><div><h3>Create recurring item</h3><p className="muted">Use Auto-post for predictable items or leave it off for a due-date reminder.</p></div></div>
          <RecurringRuleForm accounts={accounts ?? []} categories={categories ?? []} owners={owners ?? []} goals={goals ?? []} cards={cards ?? []} today={today} />
        </div>

        <div className="panel recurring-rules-panel">
          <div className="section-heading"><div><h3>Your recurring items</h3><p className="muted">Pause something temporarily without deleting its history.</p></div><strong>{visibleRules.length}</strong></div>
          {visibleRules.length === 0 ? <div className="empty">No recurring items yet.</div> : <div className="recurring-rule-list">{visibleRules.map((rule) => {
            const next = [...due, ...upcoming, ...monthOccurrences].filter((o) => o.recurring_rule_id === rule.id && o.status === "scheduled" && o.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
            return <article className="recurring-rule-card" key={rule.id}>
              <div className="recurring-rule-head"><div><strong>{rule.name}</strong><div className="recurring-rule-tags"><span className={`type-badge recurring-type-${rule.rule_type}`}>{typeLabel(rule.rule_type)}</span><span className={`status-badge ${rule.status === "active" ? "status-active" : "status-warning"}`}>{rule.status}</span>{rule.auto_post && <span className="status-badge status-active">Auto-post</span>}</div></div><strong>{money(rule.amount)}</strong></div>
              <div className="recurring-rule-meta"><span>{frequencyLabel(rule.frequency)}</span><span>Starts {rule.start_date}</span><span>{next ? `Next ${next.due_date}` : rule.end_date ? `Ends ${rule.end_date}` : "Schedule generated"}</span></div>
              <div className="recurring-rule-actions">{rule.status === "active" ? <form action={setRecurringRuleStatus}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="status" value="paused" /><button className="secondary-btn compact-btn" type="submit">Pause</button></form> : <form action={setRecurringRuleStatus}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="status" value="active" /><button className="secondary-btn compact-btn" type="submit">Resume</button></form>}<form action={setRecurringRuleStatus}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="status" value="archived" /><button className="text-btn danger-text" type="submit">Archive</button></form></div>
            </article>;
          })}</div>}
        </div>
      </section>

      <section className="panel recurring-calendar-panel">
        <div className="section-heading"><div><h3>Monthly cash-flow calendar</h3><p className="muted">See what is expected, posted, or skipped before the month arrives.</p></div><div className="month-switcher"><Link className="icon-btn" href={`/recurring?month=${shiftMonth(month, -1)}`}>←</Link><div className="month-chip">{monthLabel(month)}</div><Link className="icon-btn" href={`/recurring?month=${shiftMonth(month, 1)}`}>→</Link></div></div>
        <div className="calendar-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="recurring-calendar">{calendar.map((day) => {
          const events = occurrenceMap.get(day.iso) ?? [];
          return <div key={day.iso} className={`calendar-day ${day.inMonth ? "" : "outside"} ${day.iso === today ? "today" : ""}`}><div className="calendar-day-number">{day.day}</div><div className="calendar-events">{events.slice(0, 3).map((event) => {
            const rule = ruleMap.get(event.recurring_rule_id);
            if (!rule) return null;
            return <div key={event.id} className={`calendar-event event-${rule.rule_type} event-${event.status}`} title={`${rule.name} — ${money(event.amount)}`}><span>{rule.name}</span><strong>{money(event.amount)}</strong></div>;
          })}{events.length > 3 && <span className="calendar-more">+{events.length - 3} more</span>}</div></div>;
        })}</div>
      </section>
    </main>
  );
}
