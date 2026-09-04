-- Run this once against your database (see README "Set up the database").

CREATE TABLE IF NOT EXISTS data_sources (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('manual', 'csv', 'api', 'database')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id            SERIAL PRIMARY KEY,
  source_id     INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
  entry_date    DATE NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('revenue', 'cost')),
  category      TEXT NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'CAD',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_entry_date ON transactions (entry_date);
CREATE INDEX IF NOT EXISTS idx_transactions_kind ON transactions (kind);

-- Seed a default "Manual Entry" source so the app works immediately.
INSERT INTO data_sources (name, type)
SELECT 'Manual Entry', 'manual'
WHERE NOT EXISTS (SELECT 1 FROM data_sources WHERE name = 'Manual Entry');

-- Call-level operational detail from the CAA Garage Productivity report.
-- One row per towing call, kept separately from `transactions` so wait times,
-- driver/truck/garage, and mileage stay queryable for operational reporting,
-- not just the revenue rollups.
CREATE TABLE IF NOT EXISTS tow_calls (
  id                 SERIAL PRIMARY KEY,
  source_id          INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
  call_no            TEXT NOT NULL,
  receive_date       DATE NOT NULL,
  re_dt              TIMESTAMPTZ,
  cl_dt              TIMESTAMPTZ,
  call_status        TEXT,
  pta_wait           NUMERIC(10, 2),
  garage             TEXT,
  truck              TEXT,
  driver_id          TEXT,
  trouble_cd         TEXT,
  club_code          TEXT,
  om_mileage         NUMERIC(10, 2),
  subtotal           NUMERIC(14, 2),
  tax                NUMERIC(14, 2),
  total_cost         NUMERIC(14, 2),
  towed_kms_paid     NUMERIC(10, 2),
  towed_kms          NUMERIC(10, 2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_no, receive_date)
);

CREATE INDEX IF NOT EXISTS idx_tow_calls_receive_date ON tow_calls (receive_date);
CREATE INDEX IF NOT EXISTS idx_tow_calls_garage ON tow_calls (garage);
CREATE INDEX IF NOT EXISTS idx_tow_calls_driver ON tow_calls (driver_id);

-- ============================================================
-- Phase 1 foundation: Driver Master, Truck Master, Assignments
-- ============================================================
-- These are the identity records the rest of the portal (CAA calls,
-- Samsara telematics, driver cost, alerts) all key off of. A driver is
-- never permanently glued to one truck — see driver_truck_assignments.

CREATE TABLE IF NOT EXISTS driver_master (
  id                 SERIAL PRIMARY KEY,
  driver_id          TEXT NOT NULL UNIQUE, -- matches tow_calls.driver_id (CAA driver ID)
  driver_name        TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  email              TEXT,
  phone              TEXT,
  samsara_driver_id  TEXT,
  hourly_rate        NUMERIC(10, 2),
  monthly_salary     NUMERIC(10, 2),
  hours_per_day      NUMERIC(4, 2) NOT NULL DEFAULT 8,
  days_per_week      NUMERIC(3, 1) NOT NULL DEFAULT 5,
  compensation_type  TEXT DEFAULT 'hourly' CHECK (compensation_type IN ('hourly', 'salary', 'commission', 'mixed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For databases created before these existed.
ALTER TABLE driver_master ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10, 2);
ALTER TABLE driver_master ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC(4, 2) NOT NULL DEFAULT 8;
ALTER TABLE driver_master ADD COLUMN IF NOT EXISTS days_per_week NUMERIC(3, 1) NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS truck_master (
  id                 SERIAL PRIMARY KEY,
  truck_number       TEXT NOT NULL UNIQUE, -- matches tow_calls.truck (CAA truck code)
  unit_number        TEXT,
  plate              TEXT,
  vin                TEXT,
  vehicle_class      TEXT CHECK (vehicle_class IN ('light', 'medium', 'heavy', 'flatbed', NULL)),
  samsara_vehicle_id TEXT,
  samsara_name       TEXT, -- vehicle name as it appears in Samsara, for matching
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Driver <-> Truck assignments over time, so a driver operating multiple
-- trucks (or a truck having multiple drivers) is represented correctly
-- instead of assuming a fixed 1:1 pairing.
CREATE TABLE IF NOT EXISTS driver_truck_assignments (
  id            SERIAL PRIMARY KEY,
  driver_id     TEXT NOT NULL REFERENCES driver_master(driver_id) ON DELETE CASCADE,
  truck_number  TEXT NOT NULL REFERENCES truck_master(truck_number) ON DELETE CASCADE,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_driver ON driver_truck_assignments (driver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_truck ON driver_truck_assignments (truck_number);

-- One-time cleanup: earlier versions of the CAA import also wrote a shadow
-- copy of each call's revenue into `transactions` (category 'CAA Towing').
-- CAA revenue now comes live from tow_calls only (see /api/kpis), so any
-- leftover shadow rows would double-count the Executive Dashboard's totals.
-- Safe to run repeatedly — a no-op once cleaned up, since nothing writes
-- these rows anymore.
DELETE FROM transactions WHERE category = 'CAA Towing';

-- ============================================================
-- Phase 5: Alerts & Reporting
-- ============================================================
-- Keyed by truck_number / driver_id (TEXT), the same natural keys used by
-- driver_truck_assignments, rather than the numeric ids — consistent with
-- how the rest of the app already joins trucks and drivers.

CREATE TABLE IF NOT EXISTS alert_threshold_defaults (
  id                SERIAL PRIMARY KEY,
  alert_type        TEXT NOT NULL UNIQUE CHECK (alert_type IN
                       ('speeding', 'stunt_driving', 'excessive_idle', 'harsh_braking', 'harsh_acceleration', 'harsh_cornering')),
  threshold_value   NUMERIC,              -- NULL for stunt_driving (fixed by law) and the harsh_* on/off types
  unit              TEXT,                 -- 'km_h', 'minutes', NULL for on/off types
  grace_seconds     INTEGER NOT NULL DEFAULT 0,  -- debounce window before an alert opens
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        TEXT
);

CREATE TABLE IF NOT EXISTS alert_threshold_overrides (
  id                SERIAL PRIMARY KEY,
  scope             TEXT NOT NULL CHECK (scope IN ('truck', 'driver')),
  truck_number      TEXT REFERENCES truck_master(truck_number) ON DELETE CASCADE,
  driver_id         TEXT REFERENCES driver_master(driver_id) ON DELETE CASCADE,
  alert_type        TEXT NOT NULL CHECK (alert_type IN
                       ('speeding', 'stunt_driving', 'excessive_idle', 'harsh_braking', 'harsh_acceleration', 'harsh_cornering')),
  threshold_value   NUMERIC,              -- for stunt_driving, may only be stricter (lower over-limit) than the legal minimum
  unit              TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        TEXT,
  CONSTRAINT one_scope_target CHECK (
    (scope = 'truck' AND truck_number IS NOT NULL AND driver_id IS NULL) OR
    (scope = 'driver' AND driver_id IS NOT NULL AND truck_number IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_overrides_lookup ON alert_threshold_overrides (alert_type, truck_number, driver_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS alert_history (
  id                    SERIAL PRIMARY KEY,
  alert_type            TEXT NOT NULL,
  truck_number          TEXT REFERENCES truck_master(truck_number),
  driver_id             TEXT REFERENCES driver_master(driver_id),
  threshold_value       NUMERIC,
  threshold_source      TEXT NOT NULL,    -- 'driver' | 'truck' | 'global' | 'legal'
  observed_value        NUMERIC,
  severity              TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal', 'high')),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'acknowledged', 'dismissed')),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  acknowledged_by       TEXT,
  acknowledged_at       TIMESTAMPTZ,
  notes                 TEXT,
  notification_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at  TIMESTAMPTZ,
  -- The Samsara safety-event id (or a synthesized id for idle-duration
  -- alerts) this alert was raised from, so re-running the evaluator on an
  -- overlapping poll window never opens the same alert twice.
  external_event_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_history_truck_time ON alert_history (truck_number, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history (status);
-- Note: keyed on (alert_type, external_event_id) only, not truck_number —
-- a Samsara event id is already globally unique, and Postgres unique
-- indexes never treat two NULL truck_numbers as duplicates of each other,
-- which would defeat dedup for alerts whose vehicle->truck match failed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_history_dedupe ON alert_history (alert_type, external_event_id) WHERE external_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_rules (
  id                  SERIAL PRIMARY KEY,
  alert_type          TEXT NOT NULL UNIQUE,
  recipient_emails    TEXT[] NOT NULL DEFAULT '{}',
  throttle_minutes    INTEGER NOT NULL DEFAULT 15,  -- 0 for stunt_driving: every occurrence notifies
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Samsara's vehicle-stats endpoint is a snapshot (current engine state),
-- not a duration — this tracks how long a truck has continuously been in
-- its current state so "excessive idle minutes" can be measured across
-- polling ticks.
CREATE TABLE IF NOT EXISTS truck_engine_state (
  truck_number  TEXT PRIMARY KEY REFERENCES truck_master(truck_number) ON DELETE CASCADE,
  engine_state  TEXT NOT NULL,
  since         TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed global defaults and notification rules (safe to re-run — only fills
-- in rows that don't exist yet). Stunt driving's threshold is fixed by
-- Ontario HTA s.172, and harsh_acceleration/harsh_cornering start inactive
-- since they depend on Samsara plan coverage not yet confirmed.
INSERT INTO alert_threshold_defaults (alert_type, threshold_value, unit, grace_seconds, is_active)
VALUES
  ('speeding', 15, 'km_h', 30, TRUE),
  ('stunt_driving', NULL, NULL, 0, TRUE),
  ('excessive_idle', 15, 'minutes', 0, TRUE),
  ('harsh_braking', NULL, NULL, 0, TRUE),
  ('harsh_acceleration', NULL, NULL, 0, FALSE),
  ('harsh_cornering', NULL, NULL, 0, FALSE)
ON CONFLICT (alert_type) DO NOTHING;

INSERT INTO notification_rules (alert_type, recipient_emails, throttle_minutes, is_active)
VALUES
  ('speeding', '{}', 15, FALSE),
  ('stunt_driving', '{}', 0, FALSE),
  ('excessive_idle', '{}', 15, FALSE),
  ('harsh_braking', '{}', 15, FALSE),
  ('harsh_acceleration', '{}', 15, FALSE),
  ('harsh_cornering', '{}', 15, FALSE)
ON CONFLICT (alert_type) DO NOTHING;
