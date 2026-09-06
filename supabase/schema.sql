-- MyMoney Phase 2 database schema
-- Run this once in Supabase Dashboard > SQL Editor.

create schema if not exists private;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_type text not null check (category_type in ('income','expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, category_type, name)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('cash','bank','ewallet','savings','other')),
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date,
  status text not null default 'active' check (status in ('active','completed','paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('income','expense','transfer')),
  account_id uuid references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  owner_id uuid references public.owners(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  need_want text check (need_want is null or need_want in ('need','want')),
  fixed_variable text check (fixed_variable is null or fixed_variable in ('fixed','variable')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_id is null or to_account_id is null or account_id <> to_account_id)
);

create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  savings_goal_id uuid not null references public.savings_goals(id) on delete cascade,
  from_account_id uuid references public.accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  budget_amount numeric(14,2) not null check (budget_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_start, category_id),
  check (month_start = date_trunc('month', month_start)::date)
);

-- Index user_id because RLS filters on it.
create index if not exists owners_user_id_idx on public.owners(user_id);
create index if not exists categories_user_id_idx on public.categories(user_id);
create index if not exists accounts_user_id_idx on public.accounts(user_id);
create index if not exists savings_goals_user_id_idx on public.savings_goals(user_id);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_date_idx on public.transactions(transaction_date);
create index if not exists savings_contributions_user_id_idx on public.savings_contributions(user_id);
create index if not exists budgets_user_id_idx on public.budgets(user_id);

-- Auto-create a profile, default owner and starter categories for each new signup.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;

  insert into public.owners(user_id, name, is_default)
  values (new.id, 'Me', true)
  on conflict (user_id, name) do nothing;

  insert into public.categories(user_id, name, category_type) values
    (new.id, 'Salary', 'income'),
    (new.id, 'Allowance', 'income'),
    (new.id, 'Bonus', 'income'),
    (new.id, 'Freelance', 'income'),
    (new.id, 'Other Income', 'income'),
    (new.id, 'Food', 'expense'),
    (new.id, 'Transportation', 'expense'),
    (new.id, 'Utilities', 'expense'),
    (new.id, 'Shopping', 'expense'),
    (new.id, 'Entertainment', 'expense'),
    (new.id, 'Family Support', 'expense'),
    (new.id, 'Other Expense', 'expense')
  on conflict (user_id, category_type, name) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_mymoney on auth.users;
create trigger on_auth_user_created_mymoney
after insert on auth.users
for each row execute procedure private.handle_new_user();

-- Backfill profile/default data if this schema is run in a project that already has Auth users.
insert into public.profiles(user_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '') from auth.users
on conflict (user_id) do nothing;

insert into public.owners(user_id, name, is_default)
select id, 'Me', true from auth.users
on conflict (user_id, name) do nothing;

-- RLS
alter table public.profiles enable row level security;
alter table public.owners enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.savings_goals enable row level security;
alter table public.transactions enable row level security;
alter table public.savings_contributions enable row level security;
alter table public.budgets enable row level security;

revoke all on table public.profiles, public.owners, public.categories, public.accounts,
  public.savings_goals, public.transactions, public.savings_contributions, public.budgets
  from anon, authenticated;

grant select, insert, update, delete on table public.profiles, public.owners, public.categories, public.accounts,
  public.savings_goals, public.transactions, public.savings_contributions, public.budgets
  to authenticated;

-- Explicit per-operation policies.
do $$
declare t text;
begin
  foreach t in array array['profiles','owners','categories','accounts','savings_goals','transactions','savings_contributions','budgets']
  loop
    execute format('drop policy if exists "mymoney_select_own" on public.%I', t);
    execute format('drop policy if exists "mymoney_insert_own" on public.%I', t);
    execute format('drop policy if exists "mymoney_update_own" on public.%I', t);
    execute format('drop policy if exists "mymoney_delete_own" on public.%I', t);
    execute format('create policy "mymoney_select_own" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "mymoney_insert_own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "mymoney_update_own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "mymoney_delete_own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
