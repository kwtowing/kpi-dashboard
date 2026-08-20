"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

// Fixed column layout of the CAA Garage Productivity report (0-indexed,
// i.e. column A = 0, B = 1, ... matches the spreadsheet letters exactly).
const COLS = {
  receive_date: 0, // A
  call_no: 1, // B
  re_dt: 3, // D
  cl_dt: 10, // K
  call_status: 12, // M
  pta_wait: 13, // N
  garage: 20, // U
  truck: 22, // W
  driver_id: 23, // X
  trouble_cd: 33, // AH
  club_code: 40, // AO
  om_mileage: 41, // AP
  subtotal: 64, // BM
  tax: 65, // BN
  total_cost: 66, // BO
  towed_kms_paid: 68, // BQ
  towed_kms: 69, // BR
};

const HEADER_ROW_INDEX = 2; // row 3 in Excel, 0-indexed
const DATA_START_INDEX = 3; // row 4 in Excel, 0-indexed

type ParsedRow = {
  receive_date: string;
  call_no: string;
  re_dt: string | null;
  cl_dt: string | null;
  call_status: string | null;
  pta_wait: number | null;
  garage: string | null;
  truck: string | null;
  driver_id: string | null;
  trouble_cd: string | null;
  club_code: string | null;
  om_mileage: number | null;
  subtotal: number | null;
  tax: number | null;
  total_cost: number | null;
  towed_kms_paid: number | null;
  towed_kms: number | null;
};

function toDateStr(v: any): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  return null;
}

function toDayStr(v: any): string | null {
  const d = toDateStr(v);
  return d ? d.slice(0, 10) : null;
}

function toNum(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ImportCaaPage() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState("");

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError("");
    setResult(null);
    setStatus("idle");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

        const header = grid[HEADER_ROW_INDEX];
        if (!header || String(header[COLS.receive_date]).toLowerCase().indexOf("receive") === -1) {
          setParseError(
            "This doesn't look like a CAA Garage Productivity report — the expected header row wasn't found. Check you've uploaded the right file."
          );
          return;
        }

        const parsed: ParsedRow[] = [];
        for (let i = DATA_START_INDEX; i < grid.length; i++) {
          const r = grid[i];
          if (!r || r[COLS.call_no] === undefined || r[COLS.call_no] === "") continue;
          const day = toDayStr(r[COLS.receive_date]);
          if (!day) continue;

          parsed.push({
            receive_date: day,
            call_no: String(r[COLS.call_no]),
            re_dt: toDateStr(r[COLS.re_dt]),
            cl_dt: toDateStr(r[COLS.cl_dt]),
            call_status: r[COLS.call_status] ? String(r[COLS.call_status]) : null,
            pta_wait: toNum(r[COLS.pta_wait]),
            garage: r[COLS.garage] ? String(r[COLS.garage]) : null,
            truck: r[COLS.truck] ? String(r[COLS.truck]) : null,
            driver_id: r[COLS.driver_id] ? String(r[COLS.driver_id]) : null,
            trouble_cd: r[COLS.trouble_cd] ? String(r[COLS.trouble_cd]) : null,
            club_code: r[COLS.club_code] ? String(r[COLS.club_code]) : null,
            om_mileage: toNum(r[COLS.om_mileage]),
            subtotal: toNum(r[COLS.subtotal]),
            tax: toNum(r[COLS.tax]),
            total_cost: toNum(r[COLS.total_cost]),
            towed_kms_paid: toNum(r[COLS.towed_kms_paid]),
            towed_kms: toNum(r[COLS.towed_kms]),
          });
        }

        if (parsed.length === 0) {
          setParseError("No data rows found in this file.");
          return;
        }
        setRows(parsed);
      } catch (err: any) {
        setParseError("Couldn't read this file: " + err.message);
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
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  }

  const totalRevenue = rows.reduce((sum, r) => sum + (r.total_cost ?? 0), 0);

  return (
    <div className="px-8 py-8 max-w-2xl">
      <h1 className="font-display italic text-3xl mb-1">Import CAA productivity report</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Upload the .xls export directly — KW Towing Dynamic already knows this report&apos;s layout, so
        there&apos;s nothing to map. Each call&apos;s Total Cost is recorded as revenue.
      </p>

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
            <div className="text-xs text-[var(--ink-muted)] mb-4">
              {rows.length} calls found · total revenue{" "}
              <span className="font-mono-num">${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <table className="w-full text-xs">
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
                    <td className="py-2 font-mono-num">{r.total_cost !== null ? `$${r.total_cost}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              Imported {result.inserted} calls
              {result.skipped > 0 && <span className="text-[var(--ink-muted)]"> · {result.skipped} already imported, skipped</span>}.
              {result.errors.length > 0 && <div className="text-[var(--cost)] mt-1">{result.errors.length} rows had errors.</div>}
            </div>
          )}
          {status === "error" && <div className="text-sm text-[var(--cost)]">{error}</div>}
        </div>
      )}

      {parseError && <div className="text-sm text-[var(--cost)] mt-4">{parseError}</div>}
    </div>
  );
}
