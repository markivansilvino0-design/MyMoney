import Link from "next/link";
import { signout } from "@/app/(auth)/actions";

const nav = [
  ["Dashboard", "/dashboard"],
  ["Transactions", "/transactions"],
  ["Savings", "/savings"],
  ["Budget", "/budget"],
  ["Accounts", "/accounts"],
  ["Reports", "/reports"],
  ["Settings", "/settings"],
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">My<span>Money</span></div>
      <nav className="nav">
        {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <div className="sidebar-bottom">
        <form action={signout}><button type="submit" className="signout-btn">Sign out</button></form>
      </div>
    </aside>
  );
}
