import Link from "next/link";
import { signup } from "../actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">My<span>Money</span></div>
        <h1>Create your account</h1>
        <p className="muted">Your finances stay separated under your own Supabase user account.</p>
        {params.error && <div className="notice error">{params.error}</div>}
        <form action={signup} className="form-stack">
          <div className="field"><label htmlFor="displayName">Name</label><input id="displayName" name="displayName" type="text" placeholder="Your name" /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={6} required /></div>
          <button className="primary-btn" type="submit">Create account</button>
        </form>
        <div className="auth-footer">Already have an account? <Link href="/login">Sign in</Link></div>
      </section>
    </main>
  );
}
