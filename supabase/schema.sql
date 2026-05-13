-- ============================================
-- ST Mobile CRM — Phase 1 Database Schema
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TEAM PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS team (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'tech', -- owner, admin, tech
    color TEXT NOT NULL DEFAULT '#3B82F6',
    tools TEXT[] DEFAULT '{}',         -- e.g. {"Autel MS908", "Pico 4425"}
    permissions JSONB DEFAULT '{}',    -- e.g. {"qb_access": true, "admin": false}
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    qb_id TEXT,                       -- QuickBooks customer ID
    red_flag BOOLEAN DEFAULT false,
    red_flag_reason TEXT,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    total_spend NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- VEHICLES
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    vin TEXT UNIQUE,
    year INTEGER,
    make TEXT,
    model TEXT,
    engine TEXT,
    transmission TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- JOBS
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES team(id) ON DELETE SET NULL,
    
    -- Job basics
    job_type TEXT NOT NULL CHECK (job_type IN ('diagnostic', 'programming', 'adas', 'keys', 'other')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'complete', 'invoiced', 'paid', 'cancelled')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Shop / RO info
    shop_name TEXT,
    shop_ro_number TEXT,
    
    -- Problem description
    problem_description TEXT,
    diagnostic_codes TEXT[],           -- e.g. {"P0793", "P0795"}
    internal_notes TEXT,
    
    -- Calendar sync
    gcal_event_id TEXT,
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    scheduled_location TEXT,
    
    -- Job completion
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES team(id),
    findings TEXT,
    
    -- Invoice tracking
    qb_invoice_id TEXT,
    qb_estimate_id TEXT,
    invoice_number TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- JOB ATTACHMENTS (scan reports, photos, PDFs)
-- ============================================
CREATE TABLE IF NOT EXISTS job_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,            -- Supabase Storage path
    file_type TEXT NOT NULL,            -- image/jpeg, application/pdf, etc.
    file_size INTEGER,
    uploaded_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- JOB LINE ITEMS (labor, parts, fees per job)
-- ============================================
CREATE TABLE IF NOT EXISTS job_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'labor' CHECK (category IN ('labor', 'part', 'fee', 'discount', 'tax')),
    quantity NUMERIC(10,2) DEFAULT 1,
    unit_price NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    sort_order INTEGER DEFAULT 0,
    qb_item_id TEXT,                    -- QuickBooks item reference
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_start ON jobs(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_jobs_gcal_event_id ON jobs(gcal_event_id);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_qb_id ON customers(qb_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE team ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_line_items ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read/write all tables
-- (Team permissions are handled at the application level)
CREATE POLICY "Team access: authenticated users" ON team
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Customer access: authenticated users" ON customers
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Vehicle access: authenticated users" ON vehicles
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Job access: authenticated users" ON jobs
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Attachment access: authenticated users" ON job_attachments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Line item access: authenticated users" ON job_line_items
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- STORAGE BUCKETS
-- ============================================
-- Run these in the Supabase SQL Editor:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('job-attachments', 'job-attachments', true);
-- CREATE POLICY "Attachment access: authenticated users" ON storage.objects
--     FOR ALL USING (auth.role() = 'authenticated');
