"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; built: boolean };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Executive Dashboard", built: true }],
  },
  {
    label: "Fleet & Drivers",
    items: [
      { href: "/fleet-performance", label: "Fleet Performance", built: false },
      { href: "/drivers", label: "Driver Performance & Disputes", built: true },
      { href: "/trucks", label: "Truck Performance", built: true },
      { href: "/driver-behaviour", label: "Driver Behaviour", built: false },
    ],
  },
  {
    label: "CAA",
    items: [
      { href: "/import-caa", label: "CAA Calls", built: true },
      { href: "/caa-revenue", label: "CAA Revenue", built: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/revenue-cost", label: "Revenue & Cost Analysis", built: true },
      { href: "/performance-explorer", label: "Performance Explorer", built: false },
      { href: "/rankings", label: "Rankings", built: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/alerts", label: "Alerts", built: false },
      { href: "/reports", label: "Reports", built: false },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/add", label: "Add entry", built: true },
      { href: "/upload", label: "Import CSV", built: true },
      { href: "/sources", label: "Data Sources", built: true },
      { href: "/administration", label: "Administration", built: true },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--line)] bg-[var(--surface)] flex flex-col overflow-y-auto">
      <div className="px-6 pt-8 pb-6">
        <div className="font-display italic text-lg leading-tight">KW Towing</div>
        <div className="font-display italic text-lg leading-tight">Operations Intelligence</div>
        <div className="text-xs text-[var(--ink-muted)] mt-1.5 tracking-wide">
          Ontario · CAD
        </div>
      </div>
      <nav className="flex-1 px-3 pb-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-[var(--ink-muted)] opacity-70">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                      : "text-[var(--ink-muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span>{item.label}</span>
                  {!item.built && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg)] text-[var(--ink-muted)] shrink-0">
                      soon
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="px-6 py-4 text-[11px] text-[var(--ink-muted)] border-t border-[var(--line)]">
        Daily · Weekly · Monthly · Annual
      </div>
    </aside>
  );
}
