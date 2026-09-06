import { signout } from "@/app/(auth)/actions";
import { NavLinks } from "@/components/nav-links";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand-wrap"><div className="brand">My<span>Money</span></div><div className="brand-subtitle">Money made clearer</div></div>
      <NavLinks />
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><strong>Tip</strong><span>Keep transactions current for better reports.</span></div>
        <form action={signout}><button type="submit" className="signout-btn"><span>↪</span> Sign out</button></form>
      </div>
    </aside>
  );
}
