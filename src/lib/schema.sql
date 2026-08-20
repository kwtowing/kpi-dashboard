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
