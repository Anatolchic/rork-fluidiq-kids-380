-- Chat read receipts + admin charts data

-- ============================================================
-- messages.read_at
-- ============================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_messages_room_unread ON messages(room_id) WHERE read_at IS NULL;

-- RPC: пометить как прочитанные все чужие сообщения в комнате
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_room_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  -- Проверяем что юзер участник
  IF NOT EXISTS (
    SELECT 1 FROM chat_rooms
    WHERE id = p_room_id AND (student_id = v_uid OR tutor_id = v_uid)
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE messages
    SET read_at = NOW()
    WHERE room_id = p_room_id AND sender_id <> v_uid AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(UUID) TO authenticated;

-- ============================================================
-- Admin charts: серии за последние 30 дней
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_chart_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r JSONB;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH days AS (
    SELECT (CURRENT_DATE - i) AS d
    FROM generate_series(0, 29) AS i
    ORDER BY d
  ),
  -- регистрации
  regs AS (
    SELECT created_at::DATE AS d, COUNT(*) AS n
    FROM auth.users
    WHERE created_at::DATE >= CURRENT_DATE - 29
    GROUP BY 1
  ),
  -- бронирования по дням
  books AS (
    SELECT start_time::DATE AS d, COUNT(*) AS n
    FROM bookings
    WHERE start_time::DATE >= CURRENT_DATE - 29
    GROUP BY 1
  ),
  -- комиссия в рублях
  comm AS (
    SELECT created_at::DATE AS d, COALESCE(SUM(amount), 0) / 100.0 AS sum
    FROM payments
    WHERE type = 'commission' AND status = 'completed'
      AND created_at::DATE >= CURRENT_DATE - 29
    GROUP BY 1
  ),
  -- активные пользователи в день (по событиям bookings)
  dau AS (
    SELECT t.d, COUNT(DISTINCT t.uid) AS n
    FROM (
      SELECT start_time::DATE AS d, student_id AS uid FROM bookings WHERE start_time::DATE >= CURRENT_DATE - 29
      UNION
      SELECT start_time::DATE AS d, tutor_id AS uid FROM bookings WHERE start_time::DATE >= CURRENT_DATE - 29
    ) t GROUP BY 1
  )
  SELECT jsonb_build_object(
    'days', (SELECT jsonb_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d) FROM days),
    'registrations', (SELECT jsonb_agg(COALESCE(r.n, 0) ORDER BY days.d) FROM days LEFT JOIN regs r ON r.d = days.d),
    'bookings', (SELECT jsonb_agg(COALESCE(b.n, 0) ORDER BY days.d) FROM days LEFT JOIN books b ON b.d = days.d),
    'commission_rub', (SELECT jsonb_agg(COALESCE(c.sum, 0) ORDER BY days.d) FROM days LEFT JOIN comm c ON c.d = days.d),
    'dau', (SELECT jsonb_agg(COALESCE(d.n, 0) ORDER BY days.d) FROM days LEFT JOIN dau d ON d.d = days.d)
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_chart_data() TO authenticated;
