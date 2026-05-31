-- РЕПЕТИТОРЫ — Database Schema

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student','tutor','admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tutor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  bio TEXT DEFAULT '',
  subjects TEXT[] DEFAULT '{}',
  levels TEXT[] DEFAULT '{}',
  price_per_hour INTEGER NOT NULL DEFAULT 100000,
  min_duration INTEGER NOT NULL DEFAULT 60,
  experience_years INTEGER DEFAULT 0,
  education TEXT DEFAULT '',
  auto_confirm BOOLEAN DEFAULT FALSE,
  balance INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  payment_method TEXT DEFAULT 'card',
  payment_details TEXT DEFAULT '',
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  favorites UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tutor_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  UNIQUE(tutor_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id),
  tutor_id UUID NOT NULL REFERENCES auth.users(id),
  subject TEXT NOT NULL,
  level TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','active','completed','cancelled')),
  price INTEGER NOT NULL,
  commission INTEGER DEFAULT 20000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id),
  tutor_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text' CHECK (type IN ('text','image','file')),
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
  tutor_id UUID NOT NULL REFERENCES auth.users(id),
  student_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT DEFAULT '',
  tutor_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES auth.users(id),
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup','commission','refund')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  tbank_order_id TEXT,
  tbank_payment_id TEXT,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webrtc_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_user UUID NOT NULL,
  to_user UUID NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- T-Bank credentials and platform settings stored in DB (admin can update)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  lesson_commission INTEGER DEFAULT 20000,
  min_balance_to_start INTEGER DEFAULT 20000,
  tbank_terminal_id TEXT DEFAULT '',
  tbank_terminal_password TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_settings (id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_self" ON user_roles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tutor_profiles_read" ON tutor_profiles FOR SELECT USING (is_published = TRUE OR auth.uid() = user_id);
CREATE POLICY "tutor_profiles_write" ON tutor_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "student_profiles_self" ON student_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tutor_availability_read" ON tutor_availability FOR SELECT USING (TRUE);
CREATE POLICY "tutor_availability_write" ON tutor_availability FOR ALL USING (auth.uid() = tutor_id);
CREATE POLICY "bookings_participants" ON bookings FOR ALL USING (auth.uid() = student_id OR auth.uid() = tutor_id);
CREATE POLICY "chat_rooms_participants" ON chat_rooms FOR ALL USING (auth.uid() = student_id OR auth.uid() = tutor_id);
CREATE POLICY "messages_participants" ON messages FOR ALL USING (room_id IN (SELECT id FROM chat_rooms WHERE student_id = auth.uid() OR tutor_id = auth.uid()));
CREATE POLICY "reviews_read" ON reviews FOR SELECT USING (TRUE);
CREATE POLICY "reviews_write" ON reviews FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "reviews_reply" ON reviews FOR UPDATE USING (auth.uid() = tutor_id);
CREATE POLICY "payments_own" ON payments FOR ALL USING (auth.uid() = tutor_id);
CREATE POLICY "push_tokens_self" ON push_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "webrtc_participants" ON webrtc_signals FOR ALL USING (auth.uid() = from_user OR auth.uid() = to_user);
CREATE POLICY "settings_read" ON app_settings FOR SELECT USING (TRUE);

-- Functions
CREATE OR REPLACE FUNCTION update_tutor_rating() RETURNS TRIGGER AS $$
BEGIN
  UPDATE tutor_profiles SET
    rating = (SELECT AVG(rating) FROM reviews WHERE tutor_id = NEW.tutor_id),
    reviews_count = (SELECT COUNT(*) FROM reviews WHERE tutor_id = NEW.tutor_id)
  WHERE user_id = NEW.tutor_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER after_review_insert AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION update_tutor_rating();

CREATE OR REPLACE FUNCTION start_lesson(p_booking_id UUID) RETURNS BOOLEAN AS $$
DECLARE v_tutor_id UUID; v_commission INTEGER; v_balance INTEGER; v_min INTEGER;
BEGIN
  SELECT tutor_id INTO v_tutor_id FROM bookings WHERE id = p_booking_id;
  SELECT lesson_commission, min_balance_to_start INTO v_commission, v_min FROM app_settings LIMIT 1;
  SELECT balance INTO v_balance FROM tutor_profiles WHERE user_id = v_tutor_id;
  IF v_balance < v_min THEN RETURN FALSE; END IF;
  UPDATE tutor_profiles SET balance = balance - v_commission WHERE user_id = v_tutor_id;
  INSERT INTO payments (tutor_id, amount, type, status, description) VALUES (v_tutor_id, v_commission, 'commission', 'completed', 'Комиссия за урок ' || p_booking_id);
  UPDATE bookings SET status = 'active' WHERE id = p_booking_id;
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
