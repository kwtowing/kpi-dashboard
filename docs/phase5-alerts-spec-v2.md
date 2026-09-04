# Phase 5 Build Spec — Alerts & Reporting (v2)
**KW Towing Operations Intelligence Portal**
Live app: https://kpi-dashboard-kw14.vercel.app/

Hand this file to Claude Code as the complete, current spec for Phase 5 — it supersedes the earlier draft. Assumes Phases 1–4 (driver/truck master, assignments, CAA integration, Samsara integration) are already live on the app above.

---

## 1. Alert types

Four alert types, each independently configurable except where noted:

| Type | Source | Configurable? |
|---|---|---|
| Speeding | Samsara GPS speed vs. posted limit (soft/operational) | Yes — global + per-truck/driver override |
| Stunt driving | Ontario HTA s.172 legal definition (hard-coded) | Threshold is fixed by law; overrides may only tighten, never loosen |
| Excessive idling | Continuous idle duration | Yes — global + per-truck/driver override |
| Harsh braking | Pulled directly from Samsara's safety event feed | On/off toggle per truck/driver, no numeric threshold |

### 1a. Speeding
Softer, earlier warning than stunt driving — should fire before a stunt-driving threshold would. Uses Samsara's posted-limit-aware speeding events if available on your plan; otherwise a flat km/h-over threshold as fallback.

### 1b. Stunt driving (Ontario HTA s.172 — fixed legal definition)
Fires when **any** of the following is true:
- Posted limit **under 80 km/h** → vehicle speed is **40+ km/h over**
- Posted limit **80 km/h or higher** → vehicle speed is **50+ km/h over**
- Vehicle speed **exceeds 150 km/h**, regardless of posted limit

```ts
function isStuntDriving(speedKmh: number, postedLimitKmh: number): boolean {
  if (speedKmh > 150) return true;
  const overBy = speedKmh - postedLimitKmh;
  if (postedLimitKmh < 80 && overBy >= 40) return true;
  if (postedLimitKmh >= 80 && overBy >= 50) return true;
  return false;
}
```

Requires posted speed limit per GPS point. Pull from Samsara's road-speed-limit data if the plan includes it; otherwise this needs a separate speed-limit lookup (e.g. HERE/TomTom API) keyed to lat/long — confirm Samsara plan coverage before building, since this may add cost.

Given the legal weight: **high severity, no throttle suppression** (every occurrence notifies and logs, not just the first in a window), and a visually distinct badge (e.g. red/high-severity) in the alert history log, kept in a clearly separate row from ordinary speeding so dispatch never confuses a routine nudge with a legal-exposure event.

### 1c. Excessive idling
Continuous idle-minutes threshold. Default starting point ~15–20 minutes — tune after watching real data for a week or two rather than fixing a number up front.

### 1d. Harsh braking
Pull directly from Samsara's existing safety-event feed — do not recalculate from raw speed/accel data. While wiring this integration, also check whether Samsara sends **harsh acceleration** and **harsh cornering** on the same feed; if so, add both as additional alert types at near-zero extra cost since the integration is identical.

---

## 2. Threshold model — global defaults with per-truck/per-driver overrides

Resolution order at evaluation time: **driver override → truck override → global default**.

```sql
CREATE TABLE alert_threshold_defaults (
  id SERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('speeding','stunt_driving','excessive_idle','harsh_braking')),
  threshold_value NUMERIC,                -- NULL for stunt_driving (fixed by law) and harsh_braking (on/off)
  unit TEXT,                               -- 'km_h', 'minutes', NULL for on/off types
  grace_seconds INTEGER DEFAULT 0,         -- debounce window before an alert opens
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE alert_threshold_overrides (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('truck','driver')),
  truck_id INTEGER REFERENCES trucks(id),
  driver_id INTEGER REFERENCES drivers(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('speeding','stunt_driving','excessive_idle','harsh_braking')),
  threshold_value NUMERIC,                 -- for stunt_driving, may only be stricter (lower over-limit) than legal min
  unit TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_to TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT,
  CONSTRAINT one_scope_target CHECK (
    (scope = 'truck' AND truck_id IS NOT NULL AND driver_id IS NULL) OR
    (scope = 'driver' AND driver_id IS NOT NULL AND truck_id IS NULL)
  )
);
CREATE INDEX idx_overrides_lookup ON alert_threshold_overrides (alert_type, truck_id, driver_id) WHERE is_active = TRUE;
```

**Resolver** (`resolveThreshold(alertType, truckId, driverId)`): driver override → truck override → global default, in that order. Store which one fired (`source: 'driver'|'truck'|'global'|'legal'`) on the resulting alert row.

**Admin UI** (Settings → Alert Thresholds): editable table of global defaults; "Add override" flow (scope → entity → value → optional date range); active-overrides list showing what's currently beating the default. Stunt driving row shown as read-only/informational (legal minimum), with an option to add a stricter internal override only.

---

## 3. Alert evaluation

- Reuse the existing Samsara polling/webhook layer from Phase 3 — no second ingestion path.
- Evaluate per truck on each telemetry tick / event: pull current driver assignment, resolve threshold, compare, open/close alert.
- Debounce via `grace_seconds` per alert type (except harsh braking and stunt driving, which should fire immediately on the underlying Samsara event/condition — no grace window).

```sql
CREATE TABLE alert_history (
  id SERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  truck_id INTEGER REFERENCES trucks(id),
  driver_id INTEGER REFERENCES drivers(id),
  threshold_value NUMERIC,
  threshold_source TEXT NOT NULL,   -- 'driver' | 'truck' | 'global' | 'legal'
  observed_value NUMERIC,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','acknowledged','dismissed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  notes TEXT,
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ
);
CREATE INDEX idx_alert_history_truck_time ON alert_history (truck_id, opened_at DESC);
CREATE INDEX idx_alert_history_status ON alert_history (status);
```

---

## 4. Notification rules

```sql
CREATE TABLE notification_rules (
  id SERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  recipient_emails TEXT[] NOT NULL,
  throttle_minutes INTEGER DEFAULT 15,     -- set to 0 for stunt_driving: every occurrence notifies
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- On alert open: check active rule for that type → check throttle window (skip throttle entirely for stunt driving) → send if clear.
- Rules UI: form per alert type — recipient list, throttle minutes (locked to 0/no-throttle for stunt driving), active toggle.

**Email — provider-agnostic wrapper**, selected via `EMAIL_PROVIDER` env var (Resend/SendGrid both viable — confirm which one you hold the account with so Claude Code wires the real SDK, not a stub). API key stored as a Vercel environment variable, never in code.

Email template: truck ID, driver name, alert type, observed vs. threshold (and source: driver/truck/global/legal), timestamp, direct link to the alert in the dashboard. Stunt driving emails should visually flag the legal severity in the subject line.

---

## 5. Alert history log (UI)

- Filterable table: date range, alert type, truck, driver, status.
- Columns: Time, Truck, Driver, Type, Observed / Threshold, Source, Severity, Status, Acknowledged by.
- Row actions: Acknowledge, Add note, Dismiss.
- Summary strip: open alerts by type, alerts today vs. 7-day average, stunt-driving count called out separately given legal exposure.
- Reuse the existing drill-down pattern (year→month→week→day→driver→truck) from Phases 2–4 for consistency.

---

## 6. Build order for Claude Code

1. Confirm Samsara plan includes posted-speed-limit data (for stunt driving) and the safety-event feed (for harsh braking, and acceleration/cornering if available) — flag any plan/API gaps before writing code.
2. Migrations: `alert_threshold_defaults`, `alert_threshold_overrides`, `alert_history`, `notification_rules`.
3. Threshold resolver + unit tests (driver override beats truck beats global; stunt driving can only tighten, never loosen; expired overrides ignored).
4. Alert evaluation hook into existing Samsara layer, with the stunt-driving function above implemented exactly as specified.
5. Email provider wrapper + confirmed real implementation (Resend or SendGrid — confirm which).
6. Notification dispatch with per-type throttling (stunt driving = no throttle).
7. Admin UI: thresholds (defaults + overrides, stunt driving shown as legal-minimum/read-only) and notification rules.
8. Alert history log UI with filters, severity badges, and actions.
9. End-to-end test: trigger each alert type in staging (or with historical Samsara data), confirm correct severity/source, single email per rule with correct throttling, and accurate history log entries.

---

## Open items before starting
1. Confirm Samsara plan covers posted-speed-limit data and safety events (harsh brake/accel/corner).
2. Confirm email provider: Resend or SendGrid.
