CREATE TABLE public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  rating int,
  comment text,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT comment_len CHECK (comment IS NULL OR length(comment) <= 2000)
);
GRANT SELECT, INSERT ON public.app_feedback TO authenticated;
GRANT ALL ON public.app_feedback TO service_role;
ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback read" ON public.app_feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own feedback insert" ON public.app_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());