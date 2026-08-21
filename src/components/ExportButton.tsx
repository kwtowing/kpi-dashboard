"use client";

import * as XLSX from "xlsx";

export type ExportSheet = {
  name: string; // sheet tab name, max 31 chars, no special chars
  rows: Record<string, any>[];
};

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Sheet1";
}

export function exportToExcel(sheets: ExportSheet[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const rows = sheet.rows.length > 0 ? sheet.rows : [{ "No data": "No rows match the current filters" }];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name));
  }
  const stamped = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, stamped);
}

export default function ExportButton({
  sheets,
  filename,
  label = "Export to Excel",
}: {
  sheets: ExportSheet[];
  filename: string;
  label?: string;
}) {
  return (
    <button
      onClick={() => exportToExcel(sheets, filename)}
      className="px-4 py-1.5 rounded-full border border-[var(--line)] text-sm bg-[var(--surface)] hover:bg-[var(--bg)] transition-colors inline-flex items-center gap-1.5"
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 1v8M3 6.5l3.5 3.5L10 6.5M1.5 11.5h9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
