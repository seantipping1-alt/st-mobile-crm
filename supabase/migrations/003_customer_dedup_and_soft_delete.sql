-- Customer duplicate prevention + soft delete support
-- Already applied via Supabase CLI — this file is for reference

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique ON customers(phone) WHERE phone IS NOT NULL AND phone != '';
