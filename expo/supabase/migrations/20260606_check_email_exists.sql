CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user record;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN jsonb_build_object('exists', false);
  END IF;
  SELECT email, email_confirmed_at INTO v_user
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('exists', false);
  END IF;
  RETURN jsonb_build_object(
    'exists', true,
    'confirmed', v_user.email_confirmed_at IS NOT NULL
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO authenticated, anon;
SELECT 'ok' AS done;
