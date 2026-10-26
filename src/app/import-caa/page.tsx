"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

import { parseCaaGrid, type CaaRow, type ParseResult } from "@/lib/caaParser";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportCaaPage() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<CaaRow[]>([]);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState("");
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ inserted: number; updated: number; errors: string[]; database?: { from: string; to: string; calls: number; total: number; zeroDollar: number } } | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ total_calls: number; earliest: string | null; latest: string | null; total_revenue: number } | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/data-history")
      .then((r) => r.json())
      .then((j) => setHistory(j.error ? null : j))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError("");
    setResult(null);
    setStatus("idle");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
        const result = parseCaaGrid(grid);
        setParsed(result);
        setRows(result.rows);
      } catch (err: any) {
        setParseError(err.message);
      }
    };
    reader.readAsBinaryString(file);
  }

  async function runImport() {
    setStatus("importing");
    try {
      const res = await fetch("/api/import-caa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setResult(json);
      setStatus("done");
      loadHistory();
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  }

  const sm = parsed?.summary;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-2xl">
      <h1 className="font-display italic text-3xl mb-1">Import CAA productivity report</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-4">
        Upload the .xls export directly — KW Towing Operations Intelligence Portal already knows this report&apos;s layout, so
        there&apos;s nothing to map. Each call&apos;s Total Cost is recorded as revenue.
      </p>

      {history && history.total_calls > 0 && (
        <div className="card px-5 py-4 mb-8" style={{ borderColor: "var(--accent)" }}>
          <div className="text-sm font-medium mb-1">Everything imported so far is kept — nothing is ever deleted</div>
          <p className="text-xs text-[var(--ink-muted)]">
            <span className="font-mono-num">{history.total_calls.toLocaleString()}</span> calls stored,{" "}
            {history.earliest && history.latest && (
              <>
                spanning <span className="font-mono-num">{history.earliest}</span> to{" "}
                <span className="font-mono-num">{history.latest}</span>,{" "}
              </>
            )}
            totalling{" "}
            <span className="font-mono-num">
              ${history.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>{" "}
            in revenue. Importing a new file only adds new dates or refreshes a call CAA has
            corrected — every earlier month stays exactly as it was.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <label className="card flex flex-col items-center justify-center py-16 cursor-pointer border-dashed">
          <div className="text-sm text-[var(--ink-muted)] mb-2">Drop the .xls file or click to browse</div>
          <div className="text-xs text-[var(--ink-muted)]">Garage_Productivity_Calls_Details.xls</div>
          <input
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="text-sm font-medium mb-1">{fileName}</div>
            {sm && (
              <div className="text-xs text-[var(--ink-muted)] mb-4 space-y-1">
                <div>
                  <span className="font-mono-num">{sm.calls}</span> calls · {sm.earliest} to {sm.latest} ·{" "}
                  {sm.columns} report columns read, all kept
                </div>
                <div>
                  Subtotal <span className="font-mono-num">{money(sm.subtotal)}</span> + tax{" "}
                  <span className="font-mono-num">{money(sm.tax)}</span> = total revenue{" "}
                  <span className="font-mono-num">{money(sm.total)}</span>
                </div>
                <div>
                  {sm.zeroDollar} call{sm.zeroDollar === 1 ? "" : "s"} at $0 (will be flagged for dispute review)
                </div>
                {parsed?.warnings.map((w) => (
                  <div key={w} className="text-[var(--cost)]">{w}</div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-muted)]">
                  <th className="pb-2 font-normal">Date</th>
                  <th className="pb-2 font-normal">Call #</th>
                  <th className="pb-2 font-normal">Garage</th>
                  <th className="pb-2 font-normal">Driver</th>
                  <th className="pb-2 font-normal">Total cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r) => (
                  <tr key={r.call_no + r.receive_date} className="border-t border-[var(--line)]">
                    <td className="py-2 font-mono-num">{r.receive_date}</td>
                    <td className="py-2 font-mono-num">{r.call_no}</td>
                    <td className="py-2">{r.garage ?? "—"}</td>
                    <td className="py-2">{r.driver_id ?? "—"}</td>
                    <td className="py-2 font-mono-num">{r.total_cost !== null ? money(r.total_cost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runImport}
              disabled={status === "importing"}
              className="px-5 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm disabled:opacity-40"
            >
              {status === "importing" ? "Importing…" : `Import ${rows.length} calls`}
            </button>
            <button
              onClick={() => {
                setRows([]);
                setParsed(null);
                setFileName("");
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
              {result.inserted} new call{result.inserted === 1 ? "" : "s"} added
              {result.updated > 0 && <span className="text-[var(--ink-muted)]"> · {result.updated} existing call{result.updated === 1 ? "" : "s"} refreshed with the latest values</span>}.
              {result.errors.length > 0 && <div className="text-[var(--cost)] mt-1">{result.errors.length} rows had errors.</div>}
              {result.database && sm && (
                <div className="mt-2 text-xs text-[var(--ink-muted)]">
                  Check, {result.database.from} to {result.database.to}: file {money(sm.total)} ({sm.calls} calls) · system{" "}
                  <span className="font-mono-num">{money(result.database.total)}</span> ({result.database.calls} calls) ·{" "}
                  {Math.abs(result.database.total - sm.total) < 0.01 && result.database.calls === sm.calls ? (
                    <span className="text-[var(--revenue)]">matches</span>
                  ) : (
                    <span className="text-[var(--cost)]">
                      differs. Another earlier file holds calls in these dates that are not in this one.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {status === "error" && <div className="text-sm text-[var(--cost)]">{error}</div>}
        </div>
      )}

      {parseError && <div className="text-sm text-[var(--cost)] mt-4">{parseError}</div>}
    </div>
  );
}
