-- 1) Storage bucket avatars — гарантируем что разрешена загрузка для авторизованных
-- (был создан раньше, повторим upsert на политики для надёжности)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp'];

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_authenticated_write" ON storage.objects;
CREATE POLICY "avatars_authenticated_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
CREATE POLICY "avatars_authenticated_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;
CREATE POLICY "avatars_authenticated_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Колонка photo_url у student_profiles (репетиторы уже имеют, у учеников не было)
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 3) Таблица notifications — для колокольчика и сохранения in-app уведомлений
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- new_booking, booking_confirmed, new_message, reminder_1h, balance_topup, ...
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                    -- роут для тапа: /booking/<id>, /chat/<id> и т.п.
  data JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user_unread ON notifications (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notif_user_recent ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_self_read ON notifications;
CREATE POLICY notif_self_read ON notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS notif_self_update ON notifications;
CREATE POLICY notif_self_update ON notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- helper: mark all as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INT;
BEGIN
  UPDATE notifications SET read_at = now()
    WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;

-- Триггеры: пишем in-app notification при INSERT booking, UPDATE booking.status, INSERT message, INSERT review
CREATE OR REPLACE FUNCTION on_booking_insert() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE student_name TEXT; subj TEXT;
BEGIN
  SELECT name INTO student_name FROM student_profiles WHERE user_id = NEW.student_id;
  subj := NEW.subject || ' · ' || to_char(NEW.start_time AT TIME ZONE 'Europe/Moscow', 'DD.MM HH24:MI');
  INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (NEW.tutor_id, 'new_booking', 'Новая заявка на урок',
            COALESCE(student_name,'Ученик') || ' · ' || subj, '/booking/' || NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_booking_insert_notif ON bookings;
CREATE TRIGGER trg_booking_insert_notif AFTER INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION on_booking_insert();

CREATE OR REPLACE FUNCTION on_booking_status_update() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE tutor_name TEXT; subj TEXT;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT name INTO tutor_name FROM tutor_profiles WHERE user_id = NEW.tutor_id;
  subj := NEW.subject || ' · ' || to_char(NEW.start_time AT TIME ZONE 'Europe/Moscow', 'DD.MM HH24:MI');
  IF NEW.status = 'confirmed' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
      VALUES (NEW.student_id, 'booking_confirmed', 'Бронь подтверждена',
              COALESCE(tutor_name,'Репетитор') || ' · ' || subj, '/booking/' || NEW.id);
  ELSIF NEW.status = 'cancelled' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
      VALUES (CASE WHEN NEW.student_id = OLD.student_id THEN NEW.student_id ELSE NEW.tutor_id END,
              'booking_cancelled', 'Бронь отменена', subj, '/booking/' || NEW.id);
  ELSIF NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
      VALUES (NEW.student_id, 'review_request', 'Оставьте отзыв', 'Урок завершён · ' || subj, '/review/' || NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_booking_status_notif ON bookings;
CREATE TRIGGER trg_booking_status_notif AFTER UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION on_booking_status_update();

CREATE OR REPLACE FUNCTION on_new_message_notif() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE room RECORD; recipient UUID; sender_name TEXT;
BEGIN
  SELECT * INTO room FROM chat_rooms WHERE id = NEW.room_id;
  IF room IS NULL THEN RETURN NEW; END IF;
  recipient := CASE WHEN NEW.sender_id = room.student_id THEN room.tutor_id ELSE room.student_id END;
  SELECT name INTO sender_name FROM tutor_profiles WHERE user_id = NEW.sender_id;
  IF sender_name IS NULL THEN SELECT name INTO sender_name FROM student_profiles WHERE user_id = NEW.sender_id; END IF;
  INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (recipient, 'new_message', 'Новое сообщение',
            COALESCE(sender_name,'Собеседник') || ': ' || LEFT(COALESCE(NEW.content, ''), 80),
            '/chat/' || NEW.room_id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_message_insert_notif ON messages;
CREATE TRIGGER trg_message_insert_notif AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION on_new_message_notif();

CREATE OR REPLACE FUNCTION on_review_insert_notif() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (NEW.tutor_id, 'review_left', 'Новый отзыв',
            'Оценка: ' || NEW.rating || ' звёзд' || COALESCE(' · ' || LEFT(NEW.comment, 60),''),
            '/(tutor)/profile');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_review_insert_notif ON reviews;
CREATE TRIGGER trg_review_insert_notif AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION on_review_insert_notif();
