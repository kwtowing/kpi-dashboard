# Alerts (Phase 5)

Speeding, stunt driving (Ontario HTA s.172), excessive idling, harsh braking,
and harsh acceleration/cornering — evaluated from the existing Samsara
connector (`src/lib/connectors/samsara.ts`), on a threshold model of
driver override → truck override → global default (see
`docs/phase5-alerts-spec-v2.md` for the full spec).

## How it runs

`evaluateAlerts()` (`src/lib/alerts/evaluate.ts`) is triggered by a Vercel
Cron hitting `GET /api/alerts/evaluate` every 15 minutes (see
`vercel.json`) — the Alerts page's "Run evaluation now" button calls the
same endpoint (`POST`) for on-demand testing. Vercel Cron itself only runs
on paid plans more often than once a day; adjust the schedule to match
your plan.

## Required environment variables

Set these in Vercel under **Settings → Environment Variables**:

| Variable | Required for | Notes |
|---|---|---|
| `EMAIL_PROVIDER` | Notification emails | `resend` or `sendgrid` |
| `RESEND_API_KEY` | …if `EMAIL_PROVIDER=resend` | |
| `SENDGRID_API_KEY` | …if `EMAIL_PROVIDER=sendgrid` | |
| `ALERT_EMAIL_FROM` | Notification emails | Sender address |
| `APP_BASE_URL` | Notification emails | e.g. `https://kpi-dashboard-kw14.vercel.app` — used for the "view in dashboard" link |
| `CRON_SECRET` | Optional | If set, `/api/alerts/evaluate` requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this automatically when the variable exists) |

Until `EMAIL_PROVIDER` is set, alerts still evaluate and log to
`alert_history` normally — email dispatch is simply skipped (each
notification rule also has its own on/off toggle in the Alerts UI, off by
default).

## Known gaps (see "Open items" in the spec)

- **Posted speed limits** for stunt-driving detection come only from
  Samsara's own safety-event feed (`postedSpeedMph`), when the connected
  plan provides it. There's no per-GPS-point posted-limit lookup — if a
  speeding event doesn't carry a posted limit, only the flat
  "speed exceeds 150 km/h" clause can be evaluated for that event.
- **Harsh acceleration / cornering** default to inactive in
  `alert_threshold_defaults` until Samsara plan coverage is confirmed —
  flip `is_active` in the Thresholds tab once confirmed.
