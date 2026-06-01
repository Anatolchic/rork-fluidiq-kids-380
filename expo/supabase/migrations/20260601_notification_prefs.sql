-- Настройки уведомлений: JSONB на user_id уровне.
-- Edge Function notify-push-event читает notification_prefs.events
-- чтобы решить — слать ли push конкретного типа конкретному юзеру.

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  events jsonb NOT NULL DEFAULT '{
    "new_booking": true,
    "booking_confirmed": true,
    "booking_cancelled": true,
    "new_message": true,
    "reminder_1h": true,
    "reminder_15m": true,
    "balance_topup": true,
    "review_request": true,
    "review_left": true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS np_self_read ON notification_prefs;
DROP POLICY IF EXISTS np_self_write ON notification_prefs;
CREATE POLICY np_self_read ON notification_prefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY np_self_write ON notification_prefs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Helper: должен ли отправлять событие данному юзеру
CREATE OR REPLACE FUNCTION should_notify(p_user_id uuid, p_event text, p_channel text DEFAULT 'push')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  prefs notification_prefs;
BEGIN
  SELECT * INTO prefs FROM notification_prefs WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN true; END IF;
  IF p_channel = 'push' AND NOT prefs.push_enabled THEN RETURN false; END IF;
  IF p_channel = 'email' AND NOT prefs.email_enabled THEN RETURN false; END IF;
  IF prefs.events ? p_event AND (prefs.events->>p_event)::boolean = false THEN
    RETURN false;
  END IF;
  RETURN true;
END$$;
GRANT EXECUTE ON FUNCTION should_notify TO authenticated, service_role;
