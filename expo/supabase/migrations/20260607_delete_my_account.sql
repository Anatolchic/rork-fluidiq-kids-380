-- ФЗ-152: право на удаление аккаунта. Soft-delete: deleted_at = now() в auth.users.
-- Также инвалидируем future bookings и убираем профиль из каталога.

CREATE OR REPLACE FUNCTION public.delete_my_account(p_confirm text DEFAULT 'DELETE')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF coalesce(p_confirm, '') <> 'DELETE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmation_required');
  END IF;

  -- Защищаем админов от случайного удаления
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_cannot_self_delete');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Отменяем будущие активные бронирования (триггер освободит слоты)
  UPDATE public.bookings
    SET status = 'cancelled', cancel_reason = 'account_deleted'
    WHERE (student_id = v_uid OR tutor_id = v_uid)
      AND status IN ('pending', 'confirmed', 'active')
      AND start_time > now();

  -- Удаляем доступность из каталога (репетитор не виден)
  UPDATE public.tutor_profiles SET is_published = false WHERE user_id = v_uid;

  -- Удаляем будущие слоты репетитора
  DELETE FROM public.tutor_slots WHERE tutor_id = v_uid AND booking_id IS NULL AND slot_start > now();

  -- Soft-delete в auth.users — банит вход.
  -- Используем banned_until = '2099-01-01' для запрета входа.
  UPDATE auth.users
    SET banned_until = '2099-01-01'::timestamptz,
        email = 'deleted+' || v_uid::text || '@repetitory-app.ru',
        raw_user_meta_data = jsonb_build_object(
          'deleted_at', now()::text,
          'original_email_masked', left(coalesce(v_email, ''), 2) || '***'
        )
    WHERE id = v_uid;

  -- Снимаем сессии — пользователь будет вылогинен
  DELETE FROM auth.sessions WHERE user_id = v_uid;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, payload)
    VALUES (v_uid, 'self_delete', 'auth.users', v_uid, jsonb_build_object('email_was', v_email));

  RETURN jsonb_build_object('ok', true, 'deleted_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;
SELECT 'ok' AS done;
