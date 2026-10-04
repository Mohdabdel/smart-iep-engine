CREATE TABLE public.review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key_hash text NOT NULL,
  learner_name text,
  source_file_name text NOT NULL DEFAULT '',
  review_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','partial','completed','approved','failed')),
  review_decision text,
  review_spec_version text NOT NULL DEFAULT '',
  report_schema_version integer NOT NULL DEFAULT 4,
  review_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  approved_at timestamptz
);
CREATE INDEX review_cases_owner_idx ON public.review_cases (owner_key_hash, updated_at DESC);
GRANT ALL ON public.review_cases TO service_role;
ALTER TABLE public.review_cases ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.review_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id uuid NOT NULL REFERENCES public.review_cases(id) ON DELETE CASCADE,
  part_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  result_json jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_case_id, part_key)
);
GRANT ALL ON public.review_parts TO service_role;
ALTER TABLE public.review_parts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER review_cases_touch BEFORE UPDATE ON public.review_cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER review_parts_touch BEFORE UPDATE ON public.review_parts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();