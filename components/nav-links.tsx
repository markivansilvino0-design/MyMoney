"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const icons: Record<string, ReactNode> = {
  Dashboard: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" /></svg>,
  Transactions: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10l-2-2 1.4-1.4L20.8 8l-4.4 4.4L15 11l2-2H7V7Zm10 10H7l2 2-1.4 1.4L3.2 16l4.4-4.4L9 13l-2 2h10v2Z" /></svg>,
  Savings: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7.6 3 4 6.1 4 10c0 2.6 1.6 4.9 4 6.2V21h3v-3h2v3h3v-4.8c2.4-1.3 4-3.6 4-6.2 0-3.9-3.6-7-8-7Zm1 9h-2V7h2v5Zm4-1h-2V9h2v2Z" /></svg>,
  Budget: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4v2h10V7H7Zm0 4v2h6v-2H7Zm0 4v2h8v-2H7Z" /></svg>,
  Accounts: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v13H3V7Zm2 2v9h14V9H5Zm11 2h2v4h-2v-4ZM5 4h14v2H5V4Z" /></svg>,
  Cards: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 4h18V7H3v2Zm2 5v2h5v-2H5Z" /></svg>,
  Recurring: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 1 7.5 5.2l1.7-.7-.8 5-4.6-2.1 1.8-.8A6 6 0 1 0 17 16l1.5 1.3A8 8 0 1 1 12 4Zm-1 3h2v5.2l3.1 1.8-1 1.7-4.1-2.4V7Z" /></svg>,
  Reports: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10h3v10H5Zm6 0V4h3v16h-3Zm6 0v-7h3v7h-3Z" /></svg>,
  Settings: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19.1 13.5.1-1.5-.1-1.5 2-1.6-2-3.5-2.5 1a7 7 0 0 0-2.6-1.5L13.6 2h-4l-.4 2.9a7 7 0 0 0-2.6 1.5l-2.5-1-2 3.5 2 1.6L4 12l.1 1.5-2 1.6 2 3.5 2.5-1a7 7 0 0 0 2.6 1.5l.4 2.9h4l.4-2.9a7 7 0 0 0 2.6-1.5l2.5 1 2-3.5-2-1.6ZM11.6 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" /></svg>,
};

const nav = [
  ["Dashboard", "/dashboard"],
  ["Transactions", "/transactions"],
  ["Savings", "/savings"],
  ["Budget", "/budget"],
  ["Accounts", "/accounts"],
  ["Cards", "/credit-cards"],
  ["Recurring", "/recurring"],
  ["Reports", "/reports"],
  ["Settings", "/settings"],
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {nav.map(([label, href]) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        return <Link key={href} href={href} className={active ? "active" : ""}><span className="nav-icon">{icons[label]}</span><span className="nav-label">{label}</span></Link>;
      })}
    </nav>
  );
}
