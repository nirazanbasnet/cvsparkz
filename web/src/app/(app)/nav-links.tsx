"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/evaluate", label: "Evaluate" },
  { href: "/inbox", label: "Inbox" },
  { href: "/scan", label: "Scan" },
  { href: "/tracker", label: "Tracker" },
  { href: "/cv", label: "CV" },
  { href: "/profile", label: "Profile" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV.map((item) => {
        // Exact match, or a nested route (e.g. /cv/builder highlights "CV").
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md px-2.5 py-1.5 font-medium text-[hsl(187_74%_26%)] bg-[hsl(187_40%_96%)] dark:bg-[hsl(187_74%_32%)]/15 dark:text-[hsl(187_60%_70%)]"
                : "rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
