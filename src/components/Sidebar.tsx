"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", num: "01" },
  { href: "/add", label: "Add entry", num: "02" },
  { href: "/upload", label: "Import CSV", num: "03" },
  { href: "/import-caa", label: "Import CAA report", num: "04" },
  { href: "/drivers", label: "Drivers & disputes", num: "05" },
  { href: "/trucks", label: "Trucks (Samsara)", num: "06" },
  { href: "/sources", label: "Data sources", num: "07" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--line)] bg-[var(--surface)] flex flex-col">
      <div className="px-6 pt-8 pb-6">
        <div className="font-display italic text-xl leading-tight">KW Towing Dynamic</div>
        <div className="text-xs text-[var(--ink-muted)] mt-1.5 tracking-wide">
          Operational KPIs
        </div>
      </div>
      <nav className="flex-1 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-1 transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                  : "text-[var(--ink-muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
              }`}
            >
              <span className="font-mono-num text-[10px] opacity-60">{item.num}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-5 text-[11px] text-[var(--ink-muted)] border-t border-[var(--line)]">
        Daily · Weekly · Monthly · Annual
      </div>
    </aside>
  );
}
