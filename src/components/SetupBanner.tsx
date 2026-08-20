"use client";

import { useState } from "react";

export default function SetupBanner({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function runSetup() {
    setStatus("loading");
    try {
      const res = await fetch("/api/setup", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Setup failed");
      onReady();
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <div className="px-8 py-16 max-w-xl">
      <h1 className="font-display italic text-3xl mb-3">One step left</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-6">
        Your app is running, but its database hasn&apos;t been set up yet. This creates the
        tables Ledgerline needs to store your KPI data — it only needs to run once.
      </p>
      <button
        onClick={runSetup}
        disabled={status === "loading"}
        className="px-5 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm disabled:opacity-50"
      >
        {status === "loading" ? "Setting up…" : "Set up database"}
      </button>
      {status === "error" && (
        <div className="mt-4 text-sm text-[var(--cost)]">
          {error}
          <div className="text-[var(--ink-muted)] mt-2">
            If this mentions DATABASE_URL, make sure you&apos;ve added a Postgres database to
            your Vercel project (Storage tab → Create Database) and redeployed.
          </div>
        </div>
      )}
    </div>
  );
}
