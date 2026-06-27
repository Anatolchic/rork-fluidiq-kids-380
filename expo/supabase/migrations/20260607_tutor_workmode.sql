ALTER TABLE public.tutor_profiles
  ADD COLUMN IF NOT EXISTS work_mode text DEFAULT 'both' CHECK (work_mode IN ('online','offline','both'));

CREATE INDEX IF NOT EXISTS tutor_profiles_workmode_idx ON public.tutor_profiles(work_mode) WHERE is_published = true;
SELECT 'ok';
