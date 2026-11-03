-- ============================================
-- Migration 007: Tasks per employee + Reviews + Goals
-- ============================================

-- ─── 1. Add assigned_to to tasks ────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES team(id) ON DELETE SET NULL;

-- Default all existing tasks to Sean
UPDATE tasks SET assigned_to = '3449e3d1-9f42-4123-a2b7-65dbd46672a5' WHERE assigned_to IS NULL;

-- Index for filtering by assignee
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- ─── 2. Employee Reviews table ──────────────────────────
CREATE TABLE IF NOT EXISTS employee_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  period text NOT NULL,
  review_date timestamptz,
  employee_goal text,
  most_valuable_skill text,
  skill_needs_work text,
  biggest_issue text,
  whats_blocking text,
  what_sean_do_differently text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_reviews_team_member ON employee_reviews(team_member_id);
CREATE INDEX IF NOT EXISTS idx_employee_reviews_period ON employee_reviews(period);

-- ─── 3. Employee Goals table ────────────────────────────
CREATE TABLE IF NOT EXISTS employee_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id uuid REFERENCES employee_reviews(id) ON DELETE SET NULL,
  team_member_id uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  title text NOT NULL,
  target_date date,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  notes jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_goals_team_member ON employee_goals(team_member_id);
CREATE INDEX IF NOT EXISTS idx_employee_goals_review ON employee_goals(review_id);
CREATE INDEX IF NOT EXISTS idx_employee_goals_status ON employee_goals(status);

-- ─── 4. RLS Policies ───────────────────────────────────

-- Helper: resolve team.id from auth.uid()
-- Sean's auth_id: 095969b8-e5da-45a1-a26e-483fac0cc94c

-- ── Tasks RLS ──
-- Enable RLS on tasks (may already be enabled, IF NOT EXISTS not supported so use DO block)
DO $$ BEGIN
  ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop any existing blanket policies on tasks
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;
DROP POLICY IF EXISTS "Allow SELECT for authenticated" ON tasks;
DROP POLICY IF EXISTS "Allow INSERT for authenticated" ON tasks;
DROP POLICY IF EXISTS "Allow UPDATE for authenticated" ON tasks;
DROP POLICY IF EXISTS "Allow DELETE for authenticated" ON tasks;

-- Sean (owner) sees all tasks; others see only their assigned tasks
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT TO authenticated
  USING (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR assigned_to = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Sean can insert any task; others can only insert tasks assigned to themselves
CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR assigned_to = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Sean can update any task; others can only update their own assigned tasks
CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR assigned_to = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR assigned_to = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Sean can delete any task; others can only delete their own assigned tasks
CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE TO authenticated
  USING (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR assigned_to = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

-- ── Employee Reviews RLS ──
ALTER TABLE employee_reviews ENABLE ROW LEVEL SECURITY;

-- Sean can CRUD all reviews
CREATE POLICY "reviews_select" ON employee_reviews
  FOR SELECT TO authenticated
  USING (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR team_member_id = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "reviews_insert" ON employee_reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c');

CREATE POLICY "reviews_update" ON employee_reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c')
  WITH CHECK (auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c');

CREATE POLICY "reviews_delete" ON employee_reviews
  FOR DELETE TO authenticated
  USING (auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c');

-- ── Employee Goals RLS ──
ALTER TABLE employee_goals ENABLE ROW LEVEL SECURITY;

-- Sean sees all goals; employees see their own
CREATE POLICY "goals_select" ON employee_goals
  FOR SELECT TO authenticated
  USING (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR team_member_id = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Only Sean can create goals
CREATE POLICY "goals_insert" ON employee_goals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c');

-- Sean can update everything; employees can update notes on their own goals
CREATE POLICY "goals_update" ON employee_goals
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR team_member_id = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c'
    OR team_member_id = (SELECT id FROM team WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Only Sean can delete goals
CREATE POLICY "goals_delete" ON employee_goals
  FOR DELETE TO authenticated
  USING (auth.uid() = '095969b8-e5da-45a1-a26e-483fac0cc94c');

-- ─── 5. Updated_at trigger for employee_reviews ─────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_employee_reviews ON employee_reviews;
CREATE TRIGGER set_updated_at_employee_reviews
  BEFORE UPDATE ON employee_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
