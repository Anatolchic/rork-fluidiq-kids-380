-- Direct chats: ученик ↔ репетитор, вне бронирования
-- Возможность написать репетитору в любое время, в т.ч. до первого занятия

CREATE TABLE IF NOT EXISTS public.direct_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  student_unread int NOT NULL DEFAULT 0,
  tutor_unread int NOT NULL DEFAULT 0,
  UNIQUE (student_id, tutor_id)
);

CREATE INDEX IF NOT EXISTS direct_chats_student_idx ON public.direct_chats(student_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS direct_chats_tutor_idx ON public.direct_chats(tutor_id, last_message_at DESC);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS direct_chat_id uuid REFERENCES public.direct_chats(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS messages_direct_chat_idx ON public.messages(direct_chat_id, created_at);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_one_parent_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_one_parent_check
  CHECK ((booking_id IS NOT NULL)::int + (direct_chat_id IS NOT NULL)::int = 1);

ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dc_participants_select ON public.direct_chats;
CREATE POLICY dc_participants_select ON public.direct_chats FOR SELECT TO authenticated
  USING (auth.uid() IN (student_id, tutor_id));

DROP POLICY IF EXISTS dc_participants_update ON public.direct_chats;
CREATE POLICY dc_participants_update ON public.direct_chats FOR UPDATE TO authenticated
  USING (auth.uid() IN (student_id, tutor_id));

DROP POLICY IF EXISTS msg_direct_chat_select ON public.messages;
CREATE POLICY msg_direct_chat_select ON public.messages FOR SELECT TO authenticated
  USING (
    direct_chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.direct_chats dc
      WHERE dc.id = messages.direct_chat_id
        AND auth.uid() IN (dc.student_id, dc.tutor_id)
    )
  );

DROP POLICY IF EXISTS msg_direct_chat_insert ON public.messages;
CREATE POLICY msg_direct_chat_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    direct_chat_id IS NOT NULL AND sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.direct_chats dc
      WHERE dc.id = messages.direct_chat_id
        AND auth.uid() IN (dc.student_id, dc.tutor_id)
    )
  );

-- ensure_direct_chat: создаёт чат или возвращает существующий
-- Только student может инициировать чат с репетитором (через carousel)
-- Tutor тоже может инициировать чат со студентом если уже есть бронь от него
CREATE OR REPLACE FUNCTION public.ensure_direct_chat(p_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_role text;
  other_role text;
  v_student uuid;
  v_tutor uuid;
  v_chat_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF auth.uid() = p_other_user THEN RAISE EXCEPTION 'cannot chat with yourself'; END IF;

  SELECT role INTO my_role FROM public.user_roles WHERE user_id = auth.uid();
  SELECT role INTO other_role FROM public.user_roles WHERE user_id = p_other_user;

  IF my_role = 'student' AND other_role = 'tutor' THEN
    v_student := auth.uid(); v_tutor := p_other_user;
  ELSIF my_role = 'tutor' AND other_role = 'student' THEN
    v_student := p_other_user; v_tutor := auth.uid();
  ELSE
    RAISE EXCEPTION 'invalid chat pair: % <-> %', my_role, other_role;
  END IF;

  INSERT INTO public.direct_chats (student_id, tutor_id)
  VALUES (v_student, v_tutor)
  ON CONFLICT (student_id, tutor_id) DO UPDATE SET last_message_at = direct_chats.last_message_at
  RETURNING id INTO v_chat_id;

  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_direct_chat(uuid) TO authenticated;

-- Триггер: обновляем direct_chats.last_message_at + unread counters при INSERT в messages
CREATE OR REPLACE FUNCTION public.tg_direct_chat_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_student uuid; v_tutor uuid;
BEGIN
  IF NEW.direct_chat_id IS NULL THEN RETURN NEW; END IF;

  SELECT student_id, tutor_id INTO v_student, v_tutor
  FROM public.direct_chats WHERE id = NEW.direct_chat_id;

  UPDATE public.direct_chats
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(COALESCE(NEW.content, ''), 120),
      student_unread = student_unread + CASE WHEN NEW.sender_id = v_tutor THEN 1 ELSE 0 END,
      tutor_unread = tutor_unread + CASE WHEN NEW.sender_id = v_student THEN 1 ELSE 0 END
  WHERE id = NEW.direct_chat_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direct_chat_on_message ON public.messages;
CREATE TRIGGER direct_chat_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.direct_chat_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_direct_chat_on_message();

-- RPC: пометить direct_chat прочитанным
CREATE OR REPLACE FUNCTION public.mark_direct_chat_read(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid; v_tutor uuid;
BEGIN
  SELECT student_id, tutor_id INTO v_student, v_tutor
  FROM public.direct_chats WHERE id = p_chat_id;

  IF auth.uid() = v_student THEN
    UPDATE public.direct_chats SET student_unread = 0 WHERE id = p_chat_id;
  ELSIF auth.uid() = v_tutor THEN
    UPDATE public.direct_chats SET tutor_unread = 0 WHERE id = p_chat_id;
  ELSE
    RAISE EXCEPTION 'not a participant';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_direct_chat_read(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_chats;
