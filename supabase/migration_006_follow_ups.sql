-- Follow-ups table: one per job, tracks items needing follow-up
CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'low' CHECK (priority IN ('high', 'low', 'nice_to_know')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  closed_note text,
  created_at timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_follow_ups_job_id ON follow_ups(job_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);

-- RLS: all authenticated users can read and create; only Sean and Mike can update (close)
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see follow-ups
CREATE POLICY "follow_ups_select" ON follow_ups
  FOR SELECT TO authenticated USING (true);

-- All authenticated users can create follow-ups
CREATE POLICY "follow_ups_insert" ON follow_ups
  FOR INSERT TO authenticated WITH CHECK (true);

-- All authenticated users can update follow-ups (close them)
CREATE POLICY "follow_ups_update" ON follow_ups
  FOR UPDATE TO authenticated USING (true);
