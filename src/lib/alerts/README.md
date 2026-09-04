# Alerts (Phase 5)

Speeding, stunt driving (Ontario HTA s.172), excessive idling, harsh braking,
and harsh acceleration/cornering — evaluated from the existing Samsara
connector (`src/lib/connectors/samsara.ts`), on a threshold model of
driver override → truck override → global default (see
`docs/phase5-alerts-spec-v2.md` for the full spec).

## How it runs

`evaluateAlerts()` (`src/lib/alerts/evaluate.ts`) is triggered by hitting
`/api/alerts/evaluate` — the Alerts page's "Run evaluation now" button
calls it (`POST`) for on-demand testing.

This account's Vercel team is on the **Hobby plan**, which caps Vercel's
own Cron Jobs at once per day — far too coarse for speeding/idle/stunt
alerts. So there are two schedules layered together:

- `vercel.json` still registers a daily Vercel Cron (`GET`, once at
  12:00 UTC) as a fallback that needs no other setup.
- `.github/workflows/alerts-evaluate.yml` runs every 15 minutes via
  GitHub Actions, `POST`ing to the deployed app's public endpoint — this
  is the one actually doing the frequent polling. It needs:
  - A repository secret **`CRON_SECRET`** (Settings → Secrets and
    variables → Actions → New repository secret) matching the
    `CRON_SECRET` env var set in Vercel.
  - Optionally a repository variable **`APP_BASE_URL`** if the
    production URL is ever not `https://kpi-dashboard-kw14.vercel.app`.

If you later upgrade to Vercel Pro, the `vercel.json` schedule can be
tightened instead and the GitHub Actions workflow disabled.

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

## Samsara plan coverage

Confirmed: the connected Samsara plan provides posted-speed-limit data on
speeding events and harsh acceleration/cornering events, alongside harsh
braking. `harsh_acceleration` and `harsh_cornering` are therefore active
by default in `alert_threshold_defaults`, the same as `harsh_braking`.

Posted speed limits for stunt-driving detection come from Samsara's
safety-event feed itself (`postedSpeedMph` on a speeding event) — there's
still no separate per-GPS-point posted-limit lookup, so on the rare event
where a speeding event doesn't carry a posted limit, only the flat
"speed exceeds 150 km/h" clause can be evaluated for that one event.
