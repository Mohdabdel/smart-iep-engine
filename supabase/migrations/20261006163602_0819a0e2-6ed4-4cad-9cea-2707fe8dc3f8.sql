ALTER TABLE public.submissions
  ADD COLUMN review_case_id uuid REFERENCES public.review_cases(id) ON DELETE SET NULL,
  ADD COLUMN report_shared boolean NOT NULL DEFAULT false,
  ADD COLUMN share_requested boolean NOT NULL DEFAULT false;

CREATE POLICY "uploader reads own" ON public.submissions FOR SELECT TO authenticated USING (uploader_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_report_share(_sub uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.submissions SET share_requested = true WHERE id = _sub AND uploader_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_shared_report(_sub uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.report_json FROM public.submissions s JOIN public.review_cases c ON c.id = s.review_case_id
  WHERE s.id = _sub AND s.uploader_id = auth.uid() AND s.report_shared AND public.is_approved(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.request_report_share(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_shared_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_report_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_report(uuid) TO authenticated;