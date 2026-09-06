import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "Signed in";

  return (
    <div className="app-shell">
      <Sidebar />
      <section className="content">
        <header className="topbar">
          <h1>Personal money tracker</h1>
          <div className="user-pill">{email}</div>
        </header>
        {children}
      </section>
    </div>
  );
}
