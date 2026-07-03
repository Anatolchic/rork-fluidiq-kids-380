-- Админ одобряет/отклоняет/помечает выплаченной заявку
CREATE OR REPLACE FUNCTION public.admin_review_payout(
  p_payout_id uuid,
  p_action text,      -- approve | reject | pay
  p_comment text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_payout record;
  v_new_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF p_action = 'approve' THEN
    IF v_payout.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
    END IF;
    v_new_status := 'approved';
  ELSIF p_action = 'reject' THEN
    IF v_payout.status NOT IN ('pending', 'approved') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_status');
    END IF;
    v_new_status := 'rejected';
    -- Возвращаем средства репетитору
    UPDATE public.tutor_profiles SET balance = balance + v_payout.amount_kopecks WHERE user_id = v_payout.tutor_id;
    INSERT INTO public.wallet_transactions (tutor_id, type, amount_kopecks, balance_after, description)
      SELECT v_payout.tutor_id, 'refund', v_payout.amount_kopecks, balance, 'Отклонение заявки: ' || coalesce(p_comment, 'без комментария')
      FROM public.tutor_profiles WHERE user_id = v_payout.tutor_id;
  ELSIF p_action = 'pay' THEN
    IF v_payout.status NOT IN ('pending', 'approved') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_status');
    END IF;
    v_new_status := 'paid';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  UPDATE public.payouts SET
    status = v_new_status,
    reviewed_by = v_uid,
    reviewed_at = now(),
    comment = coalesce(p_comment, comment)
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_payout(uuid, text, text) TO authenticated;

-- Разрешаем админу читать всё в payouts (в base policy это уже есть)
SELECT 'ok';
