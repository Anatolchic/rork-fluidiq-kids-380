-- Большой пакет фич: ban+softdelete, audit, promo, subscriptions, certifications,
-- flexible pricing, recurring bookings, parental consent, app_settings новые.

-- =========================================================================
-- 1) Ban + Soft delete на user_roles
-- =========================================================================
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_user_roles_banned ON user_roles(banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_deleted ON user_roles(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION admin_ban_user(p_user_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_roles SET banned_at = NOW(), ban_reason = p_reason WHERE user_id = p_user_id;
  -- Снять публикацию у репетитора при бане
  UPDATE tutor_profiles SET is_published = FALSE WHERE user_id = p_user_id;
END $$;
GRANT EXECUTE ON FUNCTION admin_ban_user(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION admin_unban_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_roles SET banned_at = NULL, ban_reason = NULL WHERE user_id = p_user_id;
END $$;
GRANT EXECUTE ON FUNCTION admin_unban_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION admin_soft_delete_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_roles SET deleted_at = NOW() WHERE user_id = p_user_id;
  UPDATE tutor_profiles SET is_published = FALSE WHERE user_id = p_user_id;
END $$;
GRANT EXECUTE ON FUNCTION admin_soft_delete_user(UUID) TO authenticated;

-- =========================================================================
-- 2) Audit log
-- =========================================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_table, target_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_admin_read ON admin_audit_log;
CREATE POLICY audit_admin_read ON admin_audit_log FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION log_admin_action(p_action TEXT, p_table TEXT, p_target UUID, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, payload)
    VALUES (auth.uid(), p_action, p_table, p_target, p_payload);
END $$;
GRANT EXECUTE ON FUNCTION log_admin_action(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- =========================================================================
-- 3) Промо-коды
-- =========================================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  description TEXT,
  discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  discount_target TEXT NOT NULL CHECK (discount_target IN ('lesson_price','commission')),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  max_uses INT,
  used_count INT DEFAULT 0,
  per_user_limit INT DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT REFERENCES promo_codes(code) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  discount_kopecks INT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_uses_user ON promo_code_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_code ON promo_code_uses(code);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promo_codes_read ON promo_codes;
CREATE POLICY promo_codes_read ON promo_codes FOR SELECT USING (true);
DROP POLICY IF EXISTS promo_codes_admin_write ON promo_codes;
CREATE POLICY promo_codes_admin_write ON promo_codes FOR ALL USING (is_admin());
DROP POLICY IF EXISTS promo_uses_self ON promo_code_uses;
CREATE POLICY promo_uses_self ON promo_code_uses FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE OR REPLACE FUNCTION apply_promo_code(p_code TEXT, p_base_kopecks INT, p_target TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  pc promo_codes%ROWTYPE;
  user_uses INT;
  discount INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO pc FROM promo_codes WHERE code = UPPER(TRIM(p_code));
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'Промокод не найден'); END IF;
  IF pc.valid_to IS NOT NULL AND pc.valid_to < NOW() THEN RETURN json_build_object('ok', false, 'error', 'Срок промокода истёк'); END IF;
  IF pc.max_uses IS NOT NULL AND pc.used_count >= pc.max_uses THEN RETURN json_build_object('ok', false, 'error', 'Лимит промокода исчерпан'); END IF;
  IF pc.discount_target <> p_target THEN RETURN json_build_object('ok', false, 'error', 'Промокод не для этой цели'); END IF;
  SELECT COUNT(*) INTO user_uses FROM promo_code_uses WHERE code = pc.code AND user_id = auth.uid();
  IF user_uses >= pc.per_user_limit THEN RETURN json_build_object('ok', false, 'error', 'Промокод уже использован вами'); END IF;
  discount := ROUND(p_base_kopecks * pc.discount_percent / 100.0);
  RETURN json_build_object('ok', true, 'discount_kopecks', discount, 'percent', pc.discount_percent, 'description', pc.description);
END $$;
GRANT EXECUTE ON FUNCTION apply_promo_code(TEXT, INT, TEXT) TO authenticated;

-- =========================================================================
-- 4) PRO-подписка для репетиторов
-- =========================================================================
CREATE TABLE IF NOT EXISTS tutor_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_tutor ON tutor_subscriptions(tutor_id, expires_at DESC);

ALTER TABLE tutor_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_self_read ON tutor_subscriptions;
CREATE POLICY sub_self_read ON tutor_subscriptions FOR SELECT USING (auth.uid() = tutor_id OR is_admin());

-- Helper: активна ли подписка
CREATE OR REPLACE FUNCTION is_pro_tutor(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM tutor_subscriptions WHERE tutor_id = p_user_id AND expires_at > NOW())
$$;
GRANT EXECUTE ON FUNCTION is_pro_tutor(UUID) TO authenticated, anon;

-- Покупка PRO с внутреннего баланса
CREATE OR REPLACE FUNCTION buy_pro_subscription(p_months INT DEFAULT 1)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user UUID; v_price INT; v_balance INT;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT pro_subscription_price_kopecks INTO v_price FROM app_settings LIMIT 1;
  v_price := COALESCE(v_price, 99000) * p_months;
  SELECT balance INTO v_balance FROM tutor_profiles WHERE user_id = v_user;
  IF v_balance < v_price THEN RETURN json_build_object('ok', false, 'error', 'Недостаточно средств. Пополните кошелёк.'); END IF;
  UPDATE tutor_profiles SET balance = balance - v_price WHERE user_id = v_user;
  INSERT INTO payments (tutor_id, amount, type, status, description)
    VALUES (v_user, v_price, 'commission', 'completed', 'Подписка PRO ' || p_months || ' мес');
  INSERT INTO tutor_subscriptions (tutor_id, plan, expires_at)
    VALUES (v_user, 'pro', GREATEST(NOW(), (SELECT COALESCE(MAX(expires_at), NOW()) FROM tutor_subscriptions WHERE tutor_id = v_user)) + (p_months || ' months')::INTERVAL);
  RETURN json_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION buy_pro_subscription(INT) TO authenticated;

-- =========================================================================
-- 5) Сертификации/верификация репетиторов
-- =========================================================================
CREATE TABLE IF NOT EXISTS tutor_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('passport','diploma','certificate','other')),
  title TEXT,
  file_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('draft','pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cert_tutor ON tutor_certifications(tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_cert_status ON tutor_certifications(status, created_at);

ALTER TABLE tutor_certifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cert_self ON tutor_certifications;
CREATE POLICY cert_self ON tutor_certifications FOR ALL USING (auth.uid() = tutor_id OR is_admin());

ALTER TABLE tutor_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE tutor_profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Запросить верификацию (списать стоимость с баланса)
CREATE OR REPLACE FUNCTION request_verification(p_cert_ids UUID[])
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user UUID; v_price INT; v_balance INT; v_count INT;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT verification_price_kopecks INTO v_price FROM app_settings LIMIT 1;
  v_price := COALESCE(v_price, 50000);
  SELECT balance INTO v_balance FROM tutor_profiles WHERE user_id = v_user;
  IF v_balance < v_price THEN RETURN json_build_object('ok', false, 'error', 'Недостаточно средств. Пополните кошелёк.'); END IF;
  SELECT COUNT(*) INTO v_count FROM tutor_certifications WHERE id = ANY(p_cert_ids) AND tutor_id = v_user AND status = 'draft';
  IF v_count = 0 THEN RETURN json_build_object('ok', false, 'error', 'Нет документов в статусе «черновик»'); END IF;
  UPDATE tutor_profiles SET balance = balance - v_price WHERE user_id = v_user;
  INSERT INTO payments (tutor_id, amount, type, status, description)
    VALUES (v_user, v_price, 'commission', 'completed', 'Платная верификация (' || v_count || ' док.)');
  UPDATE tutor_certifications SET status = 'pending', paid = TRUE WHERE id = ANY(p_cert_ids) AND tutor_id = v_user;
  RETURN json_build_object('ok', true, 'count', v_count);
END $$;
GRANT EXECUTE ON FUNCTION request_verification(UUID[]) TO authenticated;

-- Админ: одобрить/отклонить с outomate is_verified на approve
CREATE OR REPLACE FUNCTION admin_review_certification(p_cert_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tutor UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE tutor_certifications
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        rejection_reason = CASE WHEN p_approve THEN NULL ELSE p_reason END,
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_cert_id RETURNING tutor_id INTO v_tutor;
  IF p_approve THEN
    UPDATE tutor_profiles SET is_verified = TRUE, verified_at = NOW() WHERE user_id = v_tutor;
  END IF;
  PERFORM log_admin_action(
    CASE WHEN p_approve THEN 'approve_cert' ELSE 'reject_cert' END,
    'tutor_certifications', p_cert_id, jsonb_build_object('reason', p_reason)
  );
END $$;
GRANT EXECUTE ON FUNCTION admin_review_certification(UUID, BOOLEAN, TEXT) TO authenticated;

-- =========================================================================
-- 6) Flexible pricing per slot (override price_per_hour)
-- =========================================================================
ALTER TABLE tutor_availability ADD COLUMN IF NOT EXISTS price_per_hour_override INT;

-- =========================================================================
-- 7) Recurring booking series
-- =========================================================================
CREATE TABLE IF NOT EXISTS booking_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  level TEXT,
  day_of_week INT,
  time_of_day TIME,
  duration INT,
  starts_on DATE NOT NULL,
  ends_on DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES booking_series(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_series ON bookings(series_id) WHERE series_id IS NOT NULL;

ALTER TABLE booking_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bs_participants ON booking_series;
CREATE POLICY bs_participants ON booking_series FOR ALL USING (auth.uid() = student_id OR auth.uid() = tutor_id OR is_admin());

-- =========================================================================
-- 8) Parental consent
-- =========================================================================
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_email TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_consent_at TIMESTAMPTZ;

-- =========================================================================
-- 9) app_settings новые цены
-- =========================================================================
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS verification_price_kopecks INT DEFAULT 50000;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pro_subscription_price_kopecks INT DEFAULT 99000;
