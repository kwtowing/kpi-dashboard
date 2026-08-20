"use client";

import { useState } from "react";

const CATEGORIES = {
  revenue: ["Sales", "Services", "Subscriptions", "Other income"],
  cost: ["Payroll", "Rent", "Software", "Marketing", "Materials", "Utilities", "Other expense"],
};

export default function AddEntryPage() {
  const [kind, setKind] = useState<"revenue" | "cost">("cost");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(CATEGORIES.cost[0]);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: entryDate,
          kind,
          category,
          amount: Number(amount),
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setStatus("done");
      setAmount("");
      setNotes("");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <div className="px-8 py-8 max-w-lg">
      <h1 className="font-display italic text-3xl mb-1">Add entry</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Log a revenue or cost entry by hand. It shows up on the dashboard immediately.
      </p>

      <form onSubmit={submit} className="card p-6 space-y-5">
        <div className="flex gap-2">
          {(["cost", "revenue"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setKind(k);
                setCategory(CATEGORIES[k][0]);
              }}
              className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                kind === k
                  ? k === "revenue"
                    ? "bg-[var(--revenue-soft)] border-[var(--revenue)] text-[var(--revenue)]"
                    : "bg-[var(--cost-soft)] border-[var(--cost)] text-[var(--cost)]"
                  : "border-[var(--line)] text-[var(--ink-muted)]"
              }`}
            >
              {k === "revenue" ? "Revenue" : "Cost"}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-muted)] mb-1">Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-muted)] mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm"
          >
            {CATEGORIES[kind].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-muted)] mb-1">Amount (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm font-mono-num"
            placeholder="0.00"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-muted)] mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. October payroll run"
          />
        </div>

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full py-2.5 rounded-full bg-[var(--ink)] text-white text-sm disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : status === "done" ? "Saved ✓" : "Save entry"}
        </button>
        {status === "error" && <div className="text-sm text-[var(--cost)]">{error}</div>}
      </form>
    </div>
  );
}
