-- ФЗ-152: право на получение копии ПДн
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'user', (SELECT jsonb_build_object('id', id, 'email', email, 'created_at', created_at) FROM auth.users WHERE id = v_uid),
    'role', (SELECT role FROM public.user_roles WHERE user_id = v_uid),
    'student_profile', (SELECT to_jsonb(sp) FROM public.student_profiles sp WHERE user_id = v_uid),
    'tutor_profile', (SELECT to_jsonb(tp) FROM public.tutor_profiles tp WHERE user_id = v_uid),
    'bookings', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.bookings b WHERE student_id = v_uid OR tutor_id = v_uid), '[]'::jsonb),
    'reviews', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.reviews r WHERE student_id = v_uid OR tutor_id = v_uid), '[]'::jsonb),
    'tutor_slots', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.tutor_slots s WHERE tutor_id = v_uid), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.notifications n WHERE user_id = v_uid LIMIT 500), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;
SELECT 'ok';
