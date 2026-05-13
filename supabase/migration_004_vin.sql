-- Fix: allow same VIN across different customers (vehicle at different shops)
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_key;
-- Replace with per-customer uniqueness if needed:
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_vin_customer ON vehicles(vin, customer_id);
