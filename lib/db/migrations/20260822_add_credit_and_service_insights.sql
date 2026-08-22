ALTER TABLE amd_services
  ADD COLUMN IF NOT EXISTS price_per_thousand_micros integer;

ALTER TABLE amd_orders
  ADD COLUMN IF NOT EXISTS credit_period_id text,
  ADD COLUMN IF NOT EXISTS cost_micros integer,
  ADD COLUMN IF NOT EXISTS first_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS amd_orders_user_request_idx
  ON amd_orders(user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS amd_credit_periods (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES amd_users(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  allowance_micros integer NOT NULL,
  starts_at timestamptz NOT NULL,
  resets_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS amd_credit_periods_user_period_idx
  ON amd_credit_periods(user_id, period_key);

CREATE TABLE IF NOT EXISTS amd_credit_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES amd_users(id) ON DELETE CASCADE,
  period_id text NOT NULL REFERENCES amd_credit_periods(id) ON DELETE CASCADE,
  order_id text REFERENCES amd_orders(id) ON DELETE SET NULL,
  kind text NOT NULL,
  amount_micros integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amd_credit_ledger_period_created_idx
  ON amd_credit_ledger(period_id, created_at);
CREATE INDEX IF NOT EXISTS amd_credit_ledger_order_idx
  ON amd_credit_ledger(order_id);

CREATE TABLE IF NOT EXISTS amd_order_status_events (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES amd_orders(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES amd_users(id) ON DELETE CASCADE,
  status text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amd_order_status_events_order_recorded_idx
  ON amd_order_status_events(order_id, recorded_at);