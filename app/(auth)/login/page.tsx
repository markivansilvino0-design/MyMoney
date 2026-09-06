import Link from "next/link";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">My<span>Money</span></div>
        <h1>Welcome back</h1>
        <p className="muted">Track your income, expenses and savings in one place.</p>
        {params.error && <div className="notice error">{params.error}</div>}
        {params.message && <div className="notice success">{params.message}</div>}
        <form action={login} className="form-stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={6} required /></div>
          <button className="primary-btn" type="submit">Sign in</button>
        </form>
        <div className="auth-footer">New to MyMoney? <Link href="/signup">Create account</Link></div>
      </section>
    </main>
  );
}
