-- Link line items to vehicles
-- Already applied via Supabase CLI

ALTER TABLE job_line_items ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id);
