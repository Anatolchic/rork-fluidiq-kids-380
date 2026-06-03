-- =========================================================================
-- Mass admin actions: bulk ban / unban пользователей, bulk cancel брони,
-- bulk grant/revoke PRO для репетиторов.
-- Адаптировано под существующую схему:
--   - баны живут в user_roles.banned_at / ban_reason (см. 20260602_big_features.sql)
--   - PRO живёт в tutor_subscriptions (expires_at)
--   - бронь имеет status text в bookings
-- =========================================================================

-- bookings: колонка под причину отмены (если ещё нет)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ---------- 1) Массовый ban ----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_ban(p_user_ids uuid[], p_reason text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_roles
     SET banned_at = NOW(), ban_reason = p_reason
   WHERE user_id = ANY(p_user_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE tutor_profiles SET is_published = FALSE WHERE user_id = ANY(p_user_ids);
  INSERT INTO admin_audit_log (admin_id, action, target_table, payload)
    VALUES (auth.uid(), 'bulk_ban', 'user_roles', jsonb_build_object('count', n, 'reason', p_reason, 'ids', to_jsonb(p_user_ids)));
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_ban(uuid[], text) TO authenticated;

-- ---------- 2) Массовый unban --------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_unban(p_user_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_roles
     SET banned_at = NULL, ban_reason = NULL
   WHERE user_id = ANY(p_user_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO admin_audit_log (admin_id, action, target_table, payload)
    VALUES (auth.uid(), 'bulk_unban', 'user_roles', jsonb_build_object('count', n, 'ids', to_jsonb(p_user_ids)));
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_unban(uuid[]) TO authenticated;

-- ---------- 3) Массовая отмена брони -------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_cancel_bookings(p_booking_ids uuid[], p_reason text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE bookings
     SET status = 'cancelled', cancel_reason = p_reason
   WHERE id = ANY(p_booking_ids)
     AND status <> 'cancelled';
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO admin_audit_log (admin_id, action, target_table, payload)
    VALUES (auth.uid(), 'bulk_cancel', 'bookings', jsonb_build_object('count', n, 'reason', p_reason, 'ids', to_jsonb(p_booking_ids)));
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_cancel_bookings(uuid[], text) TO authenticated;

-- ---------- 4) Массовое снятие PRO (revoke) ------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_revoke_pro(p_user_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Закрываем активные подписки задним числом
  UPDATE tutor_subscriptions
     SET expires_at = NOW()
   WHERE tutor_id = ANY(p_user_ids)
     AND expires_at > NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO admin_audit_log (admin_id, action, target_table, payload)
    VALUES (auth.uid(), 'bulk_revoke_pro', 'tutor_subscriptions', jsonb_build_object('count', n, 'ids', to_jsonb(p_user_ids)));
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_revoke_pro(uuid[]) TO authenticated;

-- ---------- 5) Массовая выдача PRO бесплатно (grant) ---------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_grant_pro(p_user_ids uuid[], p_months int DEFAULT 1)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int := 0; u uuid; v_expires timestamptz;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF COALESCE(p_months, 0) < 1 THEN RAISE EXCEPTION 'p_months must be >= 1'; END IF;
  FOREACH u IN ARRAY p_user_ids LOOP
    -- если есть активная — продлеваем от её expires_at, иначе от now()
    SELECT GREATEST(NOW(), COALESCE(MAX(expires_at), NOW())) INTO v_expires
      FROM tutor_subscriptions WHERE tutor_id = u;
    INSERT INTO tutor_subscriptions (tutor_id, plan, expires_at)
      VALUES (u, 'pro', v_expires + (p_months || ' months')::interval);
    n := n + 1;
  END LOOP;
  INSERT INTO admin_audit_log (admin_id, action, target_table, payload)
    VALUES (auth.uid(), 'bulk_grant_pro', 'tutor_subscriptions', jsonb_build_object('count', n, 'months', p_months, 'ids', to_jsonb(p_user_ids)));
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_grant_pro(uuid[], int) TO authenticated;
