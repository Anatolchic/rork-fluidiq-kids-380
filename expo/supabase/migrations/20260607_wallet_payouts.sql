-- История транзакций по балансу
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('booking_income', 'commission', 'payout', 'refund', 'manual')),
  amount_kopecks int NOT NULL,    -- + (приход) / - (расход)
  balance_after int NOT NULL,     -- баланс после транзакции (в копейках)
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wt_tutor_idx ON public.wallet_transactions(tutor_id, created_at DESC);

-- Заявки на вывод
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_kopecks int NOT NULL CHECK (amount_kopecks > 0),
  method text NOT NULL,         -- card | sbp | bank
  details text NOT NULL,        -- номер карты / СБП / реквизиты
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid','cancelled')),
  comment text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_tutor_idx ON public.payouts(tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON public.payouts(status) WHERE status = 'pending';

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wt_own ON public.wallet_transactions;
CREATE POLICY wt_own ON public.wallet_transactions FOR SELECT TO authenticated
  USING (tutor_id = auth.uid() OR (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS payouts_own ON public.payouts;
CREATE POLICY payouts_own ON public.payouts FOR SELECT TO authenticated
  USING (tutor_id = auth.uid() OR (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin');

-- RPC: запрос на вывод
CREATE OR REPLACE FUNCTION public.request_payout(
  p_amount_kopecks int,
  p_method text,
  p_details text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_balance int;
  v_payout_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_amount_kopecks IS NULL OR p_amount_kopecks <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_method NOT IN ('card', 'sbp', 'bank') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;
  IF coalesce(trim(p_details), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'details_required');
  END IF;

  SELECT balance INTO v_balance FROM public.tutor_profiles WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_profile');
  END IF;
  IF v_balance < p_amount_kopecks THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_balance);
  END IF;

  -- Списываем с баланса (резерв)
  UPDATE public.tutor_profiles SET balance = balance - p_amount_kopecks WHERE user_id = v_uid;

  -- Создаём заявку
  INSERT INTO public.payouts (tutor_id, amount_kopecks, method, details)
  VALUES (v_uid, p_amount_kopecks, p_method, p_details)
  RETURNING id INTO v_payout_id;

  -- Транзакция в истории
  INSERT INTO public.wallet_transactions (tutor_id, type, amount_kopecks, balance_after, description)
  VALUES (v_uid, 'payout', -p_amount_kopecks, v_balance - p_amount_kopecks,
          'Заявка на вывод (' || p_method || ')');

  RETURN jsonb_build_object('ok', true, 'payout_id', v_payout_id, 'balance_after', v_balance - p_amount_kopecks);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payout(int, text, text) TO authenticated;

-- RPC: отмена заявки на вывод (если ещё pending)
CREATE OR REPLACE FUNCTION public.cancel_payout(p_payout_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_payout record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id AND tutor_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_payout.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;
  UPDATE public.payouts SET status = 'cancelled', reviewed_at = now() WHERE id = p_payout_id;
  -- Возвращаем средства на баланс
  UPDATE public.tutor_profiles SET balance = balance + v_payout.amount_kopecks WHERE user_id = v_uid;
  INSERT INTO public.wallet_transactions (tutor_id, type, amount_kopecks, balance_after, description)
    SELECT v_uid, 'refund', v_payout.amount_kopecks, balance, 'Отмена заявки на вывод'
    FROM public.tutor_profiles WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_payout(uuid) TO authenticated;

SELECT 'ok';
