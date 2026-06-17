-- Add insurance job flag for estimate + discounted invoice workflow
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_insurance BOOLEAN DEFAULT false;
