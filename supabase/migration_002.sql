-- Migration 002: Structured address + contact name
ALTER TABLE customers ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_zip TEXT;
