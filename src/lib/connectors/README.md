# Data source connectors

Each connector fetches data from one external tool (accounting software, a CRM, a payment
processor, an internal database, etc.) and normalizes it into the shared `transactions` table.

## Pattern

1. Create `src/lib/connectors/<toolname>.ts`.
2. Export an async function that:
   - Authenticates with the tool's API (store credentials as Vercel environment variables,
     never in code).
   - Fetches new records since the last sync.
   - Inserts them into `transactions` with `kind: 'revenue' | 'cost'`, `category`, `amount`,
     `entry_date`, tagged to a `data_sources` row of `type: 'api'`.
3. Call it from a route under `src/app/api/sync/<toolname>/route.ts`.
4. Schedule that route with a Vercel Cron Job in `vercel.json` (see the example there) so it
   runs automatically — e.g. daily.

Ask Claude Code to build a connector for a specific tool; it will follow this same pattern so
it plugs straight into the existing dashboard, no other changes needed.
