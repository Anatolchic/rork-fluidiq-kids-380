-- Bucket для фото профилей + RPC тестовой оплаты (для dev/testing)

-- =======================================================
-- Storage bucket: avatars (public read, authenticated write)
-- =======================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Любой может SELECT (публичный)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Аутентифицированный пишет только в свою папку <user_id>/...
DROP POLICY IF EXISTS "avatars_own_write" ON storage.objects;
CREATE POLICY "avatars_own_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- =======================================================
-- App-wide test_mode флаг в app_settings
-- =======================================================
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS test_mode BOOLEAN DEFAULT TRUE;
-- В production: UPDATE app_settings SET test_mode = FALSE WHERE id = '00000000-0000-0000-0000-000000000001';

-- =======================================================
-- RPC: dev_topup — мгновенно зачисляет баланс без T-Bank
-- Работает только если app_settings.test_mode = TRUE и вызывающий — tutor
-- =======================================================
CREATE OR REPLACE FUNCTION dev_topup(p_amount_kopecks INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_test_mode BOOLEAN;
  v_new_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount_kopecks <= 0 OR p_amount_kopecks > 100000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT test_mode INTO v_test_mode FROM app_settings LIMIT 1;
  IF NOT COALESCE(v_test_mode, FALSE) THEN
    RAISE EXCEPTION 'dev_topup disabled in production';
  END IF;

  -- Проверка что вызвавший — tutor (есть профиль)
  IF NOT EXISTS (SELECT 1 FROM tutor_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'Only tutors can topup balance';
  END IF;

  UPDATE tutor_profiles SET balance = balance + p_amount_kopecks WHERE user_id = v_user_id RETURNING balance INTO v_new_balance;

  INSERT INTO payments (tutor_id, amount, type, status, description)
  VALUES (v_user_id, p_amount_kopecks, 'topup', 'completed', 'Тестовое пополнение (dev mode)');

  RETURN jsonb_build_object('success', TRUE, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION dev_topup(INTEGER) TO authenticated;

-- =======================================================
-- Закрываем дыру: tutor не должен сам менять balance в tutor_profiles
-- Создаём UPDATE-policy которая запрещает менять balance напрямую
-- =======================================================
DROP POLICY IF EXISTS "tutor_profiles_write" ON tutor_profiles;
CREATE POLICY "tutor_profiles_insert" ON tutor_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tutor_profiles_update" ON tutor_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND balance = (SELECT balance FROM tutor_profiles WHERE user_id = auth.uid())
  );
CREATE POLICY "tutor_profiles_delete" ON tutor_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);
