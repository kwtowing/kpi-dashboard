"use client";

import { useEffect, useState } from "react";

type CodeRow = {
  trouble_cd: string;
  calls: number;
  gross_revenue: number;
  tax: number;
  net_revenue: number;
  zero_paid: number;
};

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function CaaRevenuePage() {
  const [byCode, setByCode] = useState<CodeRow[]>([]);
  const [totals, setTotals] = useState<CodeRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/caa-revenue")
      .then((r) => r.json())
      .then((j) => {
        setByCode(j.byCode ?? []);
        setTotals(j.totals ?? null);
        setLoading(false);
      });
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl">
      <h1 className="font-display italic text-3xl mb-1">CAA Revenue</h1>
      <p className="text-sm text-[var(--ink-muted)] mt-1 mb-8">
        Revenue broken down by CAA trouble code, before and after HST. All figures in CAD.
      </p>
      <p className="text-xs text-[var(--ink-muted)] -mt-6 mb-8">
        Codes are shown as they appear in the CAA report — a friendlier category grouping
        (Towing vs. Roadside, Light/Medium/Heavy) can be added once you tell me how CAA&apos;s
        trouble codes map to those categories.
      </p>

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : byCode.length === 0 ? (
        <div className="card px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          No call data yet — import a CAA report to see revenue by code.
        </div>
      ) : (
        <div className="space-y-6">
          {totals && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card px-5 py-4">
                <div className="text-xs text-[var(--ink-muted)] mb-2">Calls</div>
                <div className="font-mono-num text-2xl font-medium">{totals.calls}</div>
              </div>
              <div className="card px-5 py-4">
                <div className="text-xs text-[var(--ink-muted)] mb-2">Gross revenue</div>
                <div className="font-mono-num text-2xl font-medium" style={{ color: "var(--revenue)" }}>
                  ${fmt(totals.gross_revenue)}
                </div>
              </div>
              <div className="card px-5 py-4">
                <div className="text-xs text-[var(--ink-muted)] mb-2">HST</div>
                <div className="font-mono-num text-2xl font-medium">${fmt(totals.tax)}</div>
              </div>
              <div className="card px-5 py-4">
                <div className="text-xs text-[var(--ink-muted)] mb-2">Net revenue</div>
                <div className="font-mono-num text-2xl font-medium">${fmt(totals.net_revenue)}</div>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Trouble code</th>
                  <th className="px-5 py-2 font-normal">Calls</th>
                  <th className="px-5 py-2 font-normal">Gross revenue</th>
                  <th className="px-5 py-2 font-normal">HST</th>
                  <th className="px-5 py-2 font-normal">Net revenue</th>
                  <th className="px-5 py-2 font-normal">Zero-paid</th>
                </tr>
              </thead>
              <tbody>
                {byCode.map((c) => (
                  <tr key={c.trouble_cd} className="border-t border-[var(--line)]">
                    <td className="px-5 py-2.5 font-mono-num">{c.trouble_cd}</td>
                    <td className="px-5 py-2.5 font-mono-num">{c.calls}</td>
                    <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                      ${fmt(c.gross_revenue)}
                    </td>
                    <td className="px-5 py-2.5 font-mono-num">${fmt(c.tax)}</td>
                    <td className="px-5 py-2.5 font-mono-num">${fmt(c.net_revenue)}</td>
                    <td className="px-5 py-2.5">
                      {c.zero_paid > 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--cost-soft)", color: "var(--cost)" }}>
                          {c.zero_paid}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
    </div>
  );
}
