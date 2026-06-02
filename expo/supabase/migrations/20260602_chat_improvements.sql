-- Расширения чата: reply / реакции / редактирование / удаление / поиск
-- =============================================================================

-- 1) Новые колонки в messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

-- 2) Реакции на сообщения
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_participants ON message_reactions;
CREATE POLICY mr_participants ON message_reactions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN chat_rooms c ON c.id = m.room_id
      WHERE m.id = message_reactions.message_id
        AND (auth.uid() = c.student_id OR auth.uid() = c.tutor_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      JOIN chat_rooms c ON c.id = m.room_id
      WHERE m.id = message_reactions.message_id
        AND (auth.uid() = c.student_id OR auth.uid() = c.tutor_id)
    )
  );

-- 3) Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- publication может быть не создан (локальная dev среда без Realtime) — игнорируем
  NULL;
END $$;
