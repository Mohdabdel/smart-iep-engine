-- Run ONCE on the independent STAGING Supabase project only (never production).
-- The migrations add storage policies for bucket 'submissions' but never create it.
INSERT INTO storage.buckets (id, name, public) VALUES ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;
