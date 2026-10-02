-- Add notes array to follow_ups for status updates before resolution
ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '[]'::jsonb;

-- notes format: [{"text": "Called, no answer", "by": "user-id", "by_name": "Mike", "at": "2026-09-28T..."}]
