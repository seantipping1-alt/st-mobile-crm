-- Services catalog (maps to QuickBooks Products & Services)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS services (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  default_rate numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  qb_item_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add service_id to job_line_items so line items can reference canned services
ALTER TABLE job_line_items ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id);

-- Enable RPC for the services table (same open access as other tables)
-- RLS is already disabled per project convention

-- Seed with common ST Mobile service categories
INSERT INTO services (name, description, category, default_rate) VALUES
  ('Module Programming', 'ECU/TCM/BCM module programming', 'programming', 0),
  ('Key Programming', 'Key fob programming and cutting', 'keys', 0),
  ('ADAS Calibration - Front Radar', 'Forward-facing radar calibration', 'adas', 0),
  ('ADAS Calibration - Front Camera', 'Windshield camera calibration', 'adas', 0),
  ('ADAS Calibration - Blind Spot', 'Blind spot monitor calibration', 'adas', 0),
  ('Diagnostic - Standard', 'Standard diagnostic evaluation', 'diagnostic', 0),
  ('Diagnostic - Extended', 'Extended/complex diagnostic evaluation', 'diagnostic', 0)
ON CONFLICT DO NOTHING;

-- Note: default_rate is 0 for now. Once QB sync is set up, rates will pull from QB.
-- You can update rates manually in the meantime or we'll populate them from QB later.
