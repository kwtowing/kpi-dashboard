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
  currency      TEXT NOT NULL DEFAULT 'USD',
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
