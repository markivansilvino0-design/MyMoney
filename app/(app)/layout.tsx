import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "Signed in";
  const initial = email.slice(0, 1).toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar />
      <section className="content">
        <header className="topbar">
          <div className="topbar-copy"><span className="topbar-kicker">MyMoney</span><strong>Your personal finance workspace</strong></div>
          <div className="topbar-actions"><Link className="quick-add" href="/transactions">+ Add transaction</Link><div className="user-menu"><span className="user-avatar">{initial}</span><div className="user-copy"><span>Signed in</span><strong>{email}</strong></div></div></div>
        </header>
        {children}
      </section>
    </div>
  );
}
