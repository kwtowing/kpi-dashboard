"use client";

import { useEffect, useState } from "react";

type Source = { id: number; name: string; type: string; created_at: string };

function RunMigrations() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function run() {
    setStatus("loading");
    try {
      const res = await fetch("/api/setup", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      onClick={run}
      disabled={status === "loading"}
      className="px-4 py-2 rounded-full bg-[var(--bg)] border border-[var(--line)] text-sm disabled:opacity-50"
    >
      {status === "loading" ? "Updating…" : status === "done" ? "Up to date ✓" : status === "error" ? "Failed, try again" : "Update database"}
    </button>
  );
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((j) => setSources(j.sources ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-8 py-8 max-w-3xl">
      <h1 className="font-display italic text-3xl mb-1">Data sources</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Every entry in KW Towing Operations Intelligence Portal is tagged with where it came from — manual entry, a CSV
        import, or a connected API. New API connectors (accounting, ERP, CRM tools) plug into
        the same <code className="font-mono-num text-[11px]">transactions</code> table.
      </p>

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-[var(--ink-muted)]">
                  Added {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className="text-[11px] uppercase tracking-wide px-2 py-1 rounded-full bg-[var(--bg)] text-[var(--ink-muted)]">
                {s.type}
              </span>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="px-5 py-8 text-sm text-[var(--ink-muted)] text-center">
              No sources yet — add an entry or import a CSV to create one automatically.
            </div>
          )}
        </div>
      )}

      <div className="card p-5 mt-6">
        <div className="text-sm font-medium mb-2">Database up to date?</div>
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed mb-3">
          If a new import type was added to the app (like the CAA report), click this once so
          the database picks up any new tables. It&apos;s safe to click any time — it never
          touches your existing data.
        </p>
        <RunMigrations />
      </div>

      <div className="card p-5 mt-6">
        <div className="text-sm font-medium mb-2">Connecting a live API</div>
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
          To pull in an accounting, ERP, or CRM tool automatically, add a connector under{" "}
          <code className="font-mono-num">src/lib/connectors/</code> that fetches from that
          tool&apos;s API and writes rows into the same <code className="font-mono-num">transactions</code> table
          used here, then schedule it with a Vercel Cron Job. Ask Claude Code to build the
          connector for a specific tool (e.g. QuickBooks, Stripe, Xero) and it will follow this
          same pattern.
        </p>
      </div>
    </div>
  );
}
