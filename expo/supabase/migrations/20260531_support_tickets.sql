-- Обращения пользователей в поддержку (раздел в админке)

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created ON support_tickets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  is_admin_reply BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON ticket_replies(ticket_id, created_at);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

-- Пользователь видит/создаёт свои тикеты
DROP POLICY IF EXISTS "tickets_own" ON support_tickets;
CREATE POLICY "tickets_own" ON support_tickets FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Админ — всё
DROP POLICY IF EXISTS "tickets_admin_all" ON support_tickets;
CREATE POLICY "tickets_admin_all" ON support_tickets FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Реплики: автор тикета или админ может писать в свой тикет
DROP POLICY IF EXISTS "replies_participants" ON ticket_replies;
CREATE POLICY "replies_participants" ON ticket_replies FOR ALL TO authenticated
  USING (
    sender_id = auth.uid()
    OR is_admin()
    OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    )
  );

-- Auto-update updated_at + bump status to in_progress при admin reply
CREATE OR REPLACE FUNCTION public.bump_ticket_on_reply()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE support_tickets
    SET updated_at = NOW(),
        status = CASE WHEN NEW.is_admin_reply AND status = 'open' THEN 'in_progress' ELSE status END
    WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_reply ON ticket_replies;
CREATE TRIGGER trg_ticket_reply AFTER INSERT ON ticket_replies FOR EACH ROW EXECUTE FUNCTION bump_ticket_on_reply();

-- Дашборд статистику обновим: добавим tickets_open
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
    'tickets_open', (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')),
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

-- admin_list_tickets — список тикетов с email + replies count
CREATE OR REPLACE FUNCTION public.admin_list_tickets(
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  subject TEXT,
  body TEXT,
  status TEXT,
  priority TEXT,
  replies_count BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    t.id, t.user_id, u.email::TEXT, COALESCE(tp.name, sp.name),
    t.subject, t.body, t.status, t.priority,
    (SELECT COUNT(*) FROM ticket_replies r WHERE r.ticket_id = t.id),
    t.created_at, t.updated_at
  FROM support_tickets t
  LEFT JOIN auth.users u ON u.id = t.user_id
  LEFT JOIN tutor_profiles tp ON tp.user_id = t.user_id
  LEFT JOIN student_profiles sp ON sp.user_id = t.user_id
  WHERE (p_status IS NULL OR t.status = p_status)
  ORDER BY
    CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
    t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_tickets(TEXT, INT, INT) TO authenticated;
