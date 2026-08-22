ALTER TABLE amd_orders
  ADD COLUMN IF NOT EXISTS start_count integer;

ALTER TABLE amd_orders
  ADD COLUMN IF NOT EXISTS remains integer;