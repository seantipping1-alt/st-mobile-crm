-- Fix RLS — separate SELECT and INSERT policies (more reliable)
-- First drop all existing policies
DROP POLICY IF EXISTS "Team access: authenticated users" ON team;
DROP POLICY IF EXISTS "Customer access: authenticated users" ON customers;
DROP POLICY IF EXISTS "Vehicle access: authenticated users" ON vehicles;
DROP POLICY IF EXISTS "Job access: authenticated users" ON jobs;
DROP POLICY IF EXISTS "Attachment access: authenticated users" ON job_attachments;
DROP POLICY IF EXISTS "Line item access: authenticated users" ON job_line_items;

-- Allow SELECT for authenticated users
CREATE POLICY "Allow SELECT for authenticated" ON team FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow SELECT for authenticated" ON customers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow SELECT for authenticated" ON vehicles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow SELECT for authenticated" ON jobs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow SELECT for authenticated" ON job_attachments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow SELECT for authenticated" ON job_line_items FOR SELECT USING (auth.role() = 'authenticated');

-- Allow INSERT for authenticated users
CREATE POLICY "Allow INSERT for authenticated" ON team FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow INSERT for authenticated" ON customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow INSERT for authenticated" ON vehicles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow INSERT for authenticated" ON jobs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow INSERT for authenticated" ON job_attachments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow INSERT for authenticated" ON job_line_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow UPDATE for authenticated users
CREATE POLICY "Allow UPDATE for authenticated" ON team FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow UPDATE for authenticated" ON customers FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow UPDATE for authenticated" ON vehicles FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow UPDATE for authenticated" ON jobs FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow UPDATE for authenticated" ON job_attachments FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow UPDATE for authenticated" ON job_line_items FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Allow DELETE for authenticated users
CREATE POLICY "Allow DELETE for authenticated" ON team FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow DELETE for authenticated" ON customers FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow DELETE for authenticated" ON vehicles FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow DELETE for authenticated" ON jobs FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow DELETE for authenticated" ON job_attachments FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow DELETE for authenticated" ON job_line_items FOR DELETE USING (auth.role() = 'authenticated');
