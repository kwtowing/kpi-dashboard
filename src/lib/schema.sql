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
  compensation_type  TEXT DEFAULT 'hourly' CHECK (compensation_type IN ('hourly', 'salary', 'commission', 'mixed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
