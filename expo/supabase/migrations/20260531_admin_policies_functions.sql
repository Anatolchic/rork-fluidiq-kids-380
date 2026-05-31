-- Админ-роль: расширенные RLS-policies для чтения всего + helper функции

-- =======================================================
-- Helper: is_admin()
-- =======================================================
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = is_admin.user_id AND role = 'admin');
$$;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, anon;

-- =======================================================
-- Admin SELECT-policies — админ видит всё
-- =======================================================
DROP POLICY IF EXISTS "admin_read_user_roles" ON user_roles;
CREATE POLICY "admin_read_user_roles" ON user_roles FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_all_tutor_profiles" ON tutor_profiles;
CREATE POLICY "admin_all_tutor_profiles" ON tutor_profiles FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_student_profiles" ON student_profiles;
CREATE POLICY "admin_all_student_profiles" ON student_profiles FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_read_bookings" ON bookings;
CREATE POLICY "admin_read_bookings" ON bookings FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_read_payments" ON payments;
CREATE POLICY "admin_read_payments" ON payments FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_read_reviews" ON reviews;
CREATE POLICY "admin_read_reviews" ON reviews FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_all_app_settings" ON app_settings;
CREATE POLICY "admin_all_app_settings" ON app_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_read_tutor_availability" ON tutor_availability;
CREATE POLICY "admin_read_tutor_availability" ON tutor_availability FOR SELECT TO authenticated USING (is_admin());

-- =======================================================
-- Admin: список юзеров с email (через auth.users) — SECURITY DEFINER функция
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ,
  is_published BOOLEAN,
  balance INTEGER,
  rating NUMERIC,
  reviews_count INTEGER,
  bookings_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(ur.role, 'guest'),
    COALESCE(tp.name, sp.name),
    COALESCE(tp.photo_url, sp.photo_url),
    u.created_at,
    tp.is_published,
    tp.balance,
    tp.rating,
    tp.reviews_count,
    (SELECT COUNT(*) FROM bookings b WHERE b.tutor_id = u.id OR b.student_id = u.id)
  FROM auth.users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
  LEFT JOIN student_profiles sp ON sp.user_id = u.id
  WHERE
    (p_search IS NULL OR u.email ILIKE '%' || p_search || '%' OR tp.name ILIKE '%' || p_search || '%' OR sp.name ILIKE '%' || p_search || '%')
    AND (p_role IS NULL OR ur.role = p_role)
  ORDER BY u.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, TEXT, INT, INT) TO authenticated;

-- =======================================================
-- Admin: dashboard статистика
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r JSONB;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'users_total', (SELECT COUNT(*) FROM auth.users),
    'tutors_total', (SELECT COUNT(*) FROM tutor_profiles),
    'tutors_published', (SELECT COUNT(*) FROM tutor_profiles WHERE is_published = TRUE),
    'students_total', (SELECT COUNT(*) FROM student_profiles),
    'admins_total', (SELECT COUNT(*) FROM user_roles WHERE role = 'admin'),
    'bookings_total', (SELECT COUNT(*) FROM bookings),
    'bookings_pending', (SELECT COUNT(*) FROM bookings WHERE status = 'pending'),
    'bookings_completed', (SELECT COUNT(*) FROM bookings WHERE status = 'completed'),
    'commission_total_rub', (SELECT COALESCE(SUM(amount), 0) / 100.0 FROM payments WHERE type = 'commission' AND status = 'completed'),
    'topup_total_rub', (SELECT COALESCE(SUM(amount), 0) / 100.0 FROM payments WHERE type = 'topup' AND status = 'completed'),
    'reviews_total', (SELECT COUNT(*) FROM reviews),
    'dau', (SELECT COUNT(DISTINCT user_id) FROM (
      SELECT student_id AS user_id FROM bookings WHERE start_time::DATE = CURRENT_DATE
      UNION ALL
      SELECT tutor_id AS user_id FROM bookings WHERE start_time::DATE = CURRENT_DATE
    ) t)
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

-- =======================================================
-- Admin: получить детали пользователя (с email из auth.users)
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r JSONB;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'role', (SELECT role FROM user_roles WHERE user_id = p_user_id),
    'tutor_profile', (SELECT row_to_json(t) FROM (SELECT * FROM tutor_profiles WHERE user_id = p_user_id) t),
    'student_profile', (SELECT row_to_json(s) FROM (SELECT * FROM student_profiles WHERE user_id = p_user_id) s),
    'bookings_as_student', (SELECT COALESCE(jsonb_agg(b ORDER BY b.start_time DESC), '[]'::jsonb) FROM bookings b WHERE student_id = p_user_id),
    'bookings_as_tutor', (SELECT COALESCE(jsonb_agg(b ORDER BY b.start_time DESC), '[]'::jsonb) FROM bookings b WHERE tutor_id = p_user_id),
    'payments', (SELECT COALESCE(jsonb_agg(p ORDER BY p.created_at DESC), '[]'::jsonb) FROM payments p WHERE tutor_id = p_user_id),
    'reviews_received', (SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb) FROM reviews r WHERE tutor_id = p_user_id),
    'reviews_given', (SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb) FROM reviews r WHERE student_id = p_user_id)
  )
  INTO r
  FROM auth.users u
  WHERE u.id = p_user_id;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_user(UUID) TO authenticated;

-- =======================================================
-- Admin: создать админа из существующего юзера (по email)
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_grant_admin(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO v_uid FROM auth.users WHERE email = p_email;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'user with this email not found');
  END IF;
  INSERT INTO user_roles (user_id, role) VALUES (v_uid, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
  RETURN jsonb_build_object('success', TRUE, 'user_id', v_uid);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_grant_admin(TEXT) TO authenticated;

-- =======================================================
-- Admin: отозвать админа (даунгрейд до student или удалить роль)
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_revoke_admin(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'cannot revoke yourself');
  END IF;
  DELETE FROM user_roles WHERE user_id = p_user_id AND role = 'admin';
  RETURN jsonb_build_object('success', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_admin(UUID) TO authenticated;

-- =======================================================
-- Admin: модерация публикации профиля репетитора
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_set_tutor_published(p_user_id UUID, p_published BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE tutor_profiles SET is_published = p_published WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_tutor_published(UUID, BOOLEAN) TO authenticated;

-- =======================================================
-- Admin: корректировка баланса репетитора (например, начисление платежа)
-- =======================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id UUID, p_delta_kopecks INTEGER, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_new INTEGER;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE tutor_profiles SET balance = balance + p_delta_kopecks WHERE user_id = p_user_id RETURNING balance INTO v_new;
  INSERT INTO payments (tutor_id, amount, type, status, description)
  VALUES (p_user_id, ABS(p_delta_kopecks), CASE WHEN p_delta_kopecks > 0 THEN 'topup' ELSE 'refund' END, 'completed', 'Админ: ' || COALESCE(p_reason, ''));
  RETURN jsonb_build_object('success', TRUE, 'new_balance', v_new);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(UUID, INTEGER, TEXT) TO authenticated;
