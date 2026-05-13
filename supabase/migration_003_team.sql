-- Seed team members — replace auth_id values with actual Supabase Auth user IDs
-- Find your auth user IDs: Supabase Dashboard → Authentication → Users → click each user → copy UID

INSERT INTO team (auth_id, name, role, color) VALUES
  ('REPLACE_WITH_SEAN_AUTH_ID', 'Sean', 'owner', '#1FA0E5'),
  ('REPLACE_WITH_MIKE_AUTH_ID', 'Mike', 'admin', '#10B981'),
  ('REPLACE_WITH_STEVE_AUTH_ID', 'Steve', 'tech', '#F59E0B'),
  ('REPLACE_WITH_NOAH_AUTH_ID', 'Noah', 'tech', '#EF4444'),
  ('REPLACE_WITH_KEEGAN_AUTH_ID', 'Keegan', 'tech', '#8B5CF6')
ON CONFLICT (auth_id) DO NOTHING;
