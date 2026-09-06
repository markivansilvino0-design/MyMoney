# MyMoney — Phase 2

MyMoney is a personal savings, income and expense tracker built with Next.js 16 and Supabase.

## Phase 2 includes

- Next.js App Router project
- Supabase browser/server clients
- Next.js 16 `proxy.ts` session refresh
- Email/password sign up, sign in and sign out
- Email confirmation route
- Protected app layout
- Dashboard with live Supabase queries
- Navigation for Transactions, Savings, Budget, Accounts, Reports and Settings
- Database schema with RLS
- Automatic starter categories and a default owner (`Me`) for new users

## 1. Create a Supabase project

Create a fresh Supabase project for MyMoney.

Open **Project > Connect** and copy:
- Project URL
- Publishable key

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and replace the placeholders:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Never commit `.env.local`.

## 3. Create the database

Open **Supabase > SQL Editor**.

Copy the complete contents of `supabase/schema.sql`, paste it in the SQL editor, and run it once.

## 4. Configure email confirmation

For SSR confirmation, go to **Authentication > Email Templates > Confirm signup** and make the confirmation link use:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

For local development, set the Auth Site URL to:

```text
http://localhost:3000
```

When deployed, change the Site URL to the Vercel production URL.

## 5. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## 6. Production setup

When deploying to Vercel, add the same two Supabase environment variables in Vercel Project Settings > Environment Variables.

## Phase 3

The next phase will replace the Transactions placeholder with the real Add/Edit/Delete transaction system for Income, Expense and Transfer, then connect savings contributions and account balances.
