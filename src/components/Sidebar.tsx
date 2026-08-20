"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [open, setOpen] = useState(false);

  // Close the mobile menu on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="font-display italic text-base">KW Towing</div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--line)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Backdrop (mobile only, while menu open) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 shrink-0 border-r border-[var(--line)] bg-[var(--surface)] flex flex-col overflow-y-auto
          fixed inset-y-0 left-0 z-50 transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static`}
      >
        <div className="px-6 pt-8 pb-6 flex items-start justify-between lg:block">
          <div>
            <div className="font-display italic text-lg leading-tight">KW Towing</div>
            <div className="font-display italic text-lg leading-tight">Operations Intelligence</div>
            <div className="text-xs text-[var(--ink-muted)] mt-1.5 tracking-wide">Ontario · CAD</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--line)] shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
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
    </>
  );
}
