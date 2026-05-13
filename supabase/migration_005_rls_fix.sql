-- Fix RLS policies — add WITH CHECK for INSERT permissions
-- The original policies only had USING (for SELECT), missing WITH CHECK (for INSERT/UPDATE)

DROP POLICY IF EXISTS "Team access: authenticated users" ON team;
DROP POLICY IF EXISTS "Customer access: authenticated users" ON customers;
DROP POLICY IF EXISTS "Vehicle access: authenticated users" ON vehicles;
DROP POLICY IF EXISTS "Job access: authenticated users" ON jobs;
DROP POLICY IF EXISTS "Attachment access: authenticated users" ON job_attachments;
DROP POLICY IF EXISTS "Line item access: authenticated users" ON job_line_items;

CREATE POLICY "Team access: authenticated users" ON team
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Customer access: authenticated users" ON customers
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Vehicle access: authenticated users" ON vehicles
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Job access: authenticated users" ON jobs
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Attachment access: authenticated users" ON job_attachments
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Line item access: authenticated users" ON job_line_items
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
