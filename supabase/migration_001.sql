-- Add customer_type to existing customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'shop' CHECK (customer_type IN ('shop', 'individual'));
