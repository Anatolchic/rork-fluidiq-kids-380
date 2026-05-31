-- Триггеры на events + pg_cron для напоминаний

-- pg_cron + pg_net extensions (для http_post из БД)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Базовый URL Edge Functions и service-role key из app_settings
-- Сохраняем в _config (отдельная таблица)
CREATE TABLE IF NOT EXISTS _config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Owner может вписать service role key + functions url для cron
INSERT INTO _config(key, value) VALUES
  ('functions_url', 'http://kong:8000/functions/v1'),
  ('service_role_key', '')
ON CONFLICT (key) DO NOTHING;

-- Helper для вызова Edge Function из БД (через pg_net)
CREATE OR REPLACE FUNCTION public.call_edge_function(p_name TEXT, p_body JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT value INTO v_url FROM _config WHERE key = 'functions_url';
  SELECT value INTO v_key FROM _config WHERE key = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'call_edge_function: service_role_key not configured';
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url := v_url || '/' || p_name,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key)
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

-- ============================================================
-- Триггер: новая запись booking → notify-push-event new_booking
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_booking_created()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'new_booking', 'booking_id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS after_booking_insert ON bookings;
CREATE TRIGGER after_booking_insert AFTER INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION trg_booking_created();

-- Booking status changed
CREATE OR REPLACE FUNCTION public.trg_booking_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'booking_confirmed', 'booking_id', NEW.id));
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'booking_cancelled', 'booking_id', NEW.id));
    ELSIF NEW.status = 'completed' THEN
      PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'review_request', 'booking_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS after_booking_status ON bookings;
CREATE TRIGGER after_booking_status AFTER UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION trg_booking_status_changed();

-- New message in chat
CREATE OR REPLACE FUNCTION public.trg_message_created()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'new_message', 'room_id', NEW.room_id, 'message_id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS after_message_insert ON messages;
CREATE TRIGGER after_message_insert AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION trg_message_created();

-- New review
CREATE OR REPLACE FUNCTION public.trg_review_created()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'review_left', 'review_id', NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS after_review_insert_notify ON reviews;
CREATE TRIGGER after_review_insert_notify AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION trg_review_created();

-- ============================================================
-- pg_cron: напоминания за 1ч и 15мин
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_lesson_reminders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r RECORD;
BEGIN
  -- 1 час до старта (60 ± 5 минут)
  FOR r IN
    SELECT id FROM bookings
    WHERE status = 'confirmed'
      AND start_time BETWEEN NOW() + INTERVAL '55 minutes' AND NOW() + INTERVAL '65 minutes'
  LOOP
    PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'reminder_1h', 'booking_id', r.id));
  END LOOP;

  -- 15 минут (15 ± 3 минут)
  FOR r IN
    SELECT id FROM bookings
    WHERE status = 'confirmed'
      AND start_time BETWEEN NOW() + INTERVAL '12 minutes' AND NOW() + INTERVAL '18 minutes'
  LOOP
    PERFORM call_edge_function('notify-push-event', jsonb_build_object('event', 'reminder_15m', 'booking_id', r.id));
  END LOOP;
END;
$$;

-- Запускаем каждые 5 минут
DO $$
BEGIN
  PERFORM cron.unschedule('lesson-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('lesson-reminders', '*/5 * * * *', $$SELECT public.send_lesson_reminders()$$);

-- Авто-completed для уроков которые давно закончились (end_time < now - 10 min) и были active
CREATE OR REPLACE FUNCTION public.auto_complete_lessons()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE bookings SET status = 'completed'
  WHERE status IN ('active', 'confirmed')
    AND end_time < NOW() - INTERVAL '10 minutes';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('auto-complete', '*/10 * * * *', $$SELECT public.auto_complete_lessons()$$);
