"use client";

import { useState } from "react";
import Papa from "papaparse";

type ParsedRow = Record<string, string>;

const TARGET_FIELDS = [
  { key: "entry_date", label: "Date" },
  { key: "kind", label: "Revenue or cost" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount" },
  { key: "notes", label: "Notes (optional)" },
];

export default function UploadPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sourceName, setSourceName] = useState("");
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ inserted: number; errors: string[] } | null>(null);
  const [error, setError] = useState("");

  function handleFile(file: File) {
    setSourceName(file.name.replace(/\.csv$/i, ""));
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields ?? [];
        setColumns(cols);
        setRows(res.data);

        // best-effort auto-mapping by column name
        const auto: Record<string, string> = {};
        for (const t of TARGET_FIELDS) {
          const match = cols.find((c) => c.toLowerCase().includes(t.key.split("_")[0]));
          if (match) auto[t.key] = match;
        }
        setMapping(auto);
      },
    });
  }

  async function runImport() {
    setStatus("importing");
    try {
      const mapped = rows.map((r) => ({
        entry_date: r[mapping.entry_date] ?? "",
        kind: (r[mapping.kind] ?? "").toLowerCase().includes("rev") ? "revenue" : "cost",
        category: r[mapping.category] ?? "Uncategorized",
        amount: Number(r[mapping.amount] ?? 0),
        notes: mapping.notes ? r[mapping.notes] : undefined,
      }));

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped, sourceName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setResult(json);
      setStatus("done");
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  }

  const ready = TARGET_FIELDS.filter((f) => f.key !== "notes").every((f) => mapping[f.key]);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-2xl">
      <h1 className="font-display italic text-3xl mb-1">Import CSV</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Upload a spreadsheet export from any tool. Map its columns once — you can reuse this
        source next time by uploading the same file name.
      </p>

      {rows.length === 0 ? (
        <label className="card flex flex-col items-center justify-center py-16 cursor-pointer border-dashed">
          <div className="text-sm text-[var(--ink-muted)] mb-2">Drop a CSV file or click to browse</div>
          <div className="text-xs text-[var(--ink-muted)]">Needs a date, an amount, and a category column</div>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="text-sm font-medium mb-3">
              {rows.length} rows found — match your columns to KW Towing Operations Intelligence Portal&apos;s fields
            </div>
            <div className="space-y-3">
              {TARGET_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-[var(--ink-muted)] w-40 shrink-0">{f.label}</span>
                  <select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="flex-1 border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">— not mapped —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="text-sm font-medium mb-1">Preview</div>
            <div className="text-xs text-[var(--ink-muted)] mb-3">First 3 rows, as they&apos;ll be imported</div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-muted)]">
                  {TARGET_FIELDS.map((f) => (
                    <th key={f.key} className="pb-2 font-normal">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--line)]">
                    {TARGET_FIELDS.map((f) => (
                      <td key={f.key} className="py-2 font-mono-num">
                        {mapping[f.key] ? r[mapping[f.key]] : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runImport}
              disabled={!ready || status === "importing"}
              className="px-5 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm disabled:opacity-40"
            >
              {status === "importing" ? "Importing…" : `Import ${rows.length} rows`}
            </button>
            <button
              onClick={() => {
                setRows([]);
                setColumns([]);
                setMapping({});
                setStatus("idle");
                setResult(null);
              }}
              className="text-sm text-[var(--ink-muted)]"
            >
              Start over
            </button>
          </div>

          {status === "done" && result && (
            <div className="text-sm text-[var(--revenue)]">
              Imported {result.inserted} rows.
              {result.errors.length > 0 && (
                <div className="text-[var(--cost)] mt-1">{result.errors.length} rows skipped.</div>
              )}
            </div>
          )}
          {status === "error" && <div className="text-sm text-[var(--cost)]">{error}</div>}
        </div>
      )}
    </div>
  );
}
