-- Telegram notifications: привязка Telegram chat_id к user_id
-- Юзер генерирует deep-link токен, открывает t.me/<bot>?start=<token>,
-- бот вызывает RPC telegram_link_chat который связывает chat_id с user_id

CREATE TABLE IF NOT EXISTS user_telegram_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);
CREATE INDEX IF NOT EXISTS idx_tg_tokens_user ON telegram_link_tokens(user_id);

ALTER TABLE user_telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tg_link_self_read ON user_telegram_links;
CREATE POLICY tg_link_self_read ON user_telegram_links FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS tg_link_self_delete ON user_telegram_links;
CREATE POLICY tg_link_self_delete ON user_telegram_links FOR DELETE USING (auth.uid() = user_id);

-- Юзер генерирует токен (валиден 30 минут), бэк-функция бота
-- потом обменивает токен на запись в user_telegram_links.
CREATE OR REPLACE FUNCTION telegram_create_link_token()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user UUID;
  v_token TEXT;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  -- удаляем старые токены и истёкшие
  DELETE FROM telegram_link_tokens WHERE user_id = v_user OR expires_at < NOW();
  -- генерируем новый
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO telegram_link_tokens (token, user_id) VALUES (v_token, v_user);
  RETURN v_token;
END $$;
GRANT EXECUTE ON FUNCTION telegram_create_link_token() TO authenticated;

-- Вызывается из Edge Function tg-bot-webhook (service_role) при /start <token>
CREATE OR REPLACE FUNCTION telegram_link_chat(p_token TEXT, p_chat_id BIGINT, p_username TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user UUID;
BEGIN
  SELECT user_id INTO v_user FROM telegram_link_tokens WHERE token = p_token AND expires_at > NOW();
  IF v_user IS NULL THEN RAISE EXCEPTION 'invalid or expired token'; END IF;
  INSERT INTO user_telegram_links (user_id, chat_id, username)
    VALUES (v_user, p_chat_id, p_username)
    ON CONFLICT (user_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, username = EXCLUDED.username, linked_at = NOW();
  DELETE FROM telegram_link_tokens WHERE token = p_token;
  RETURN v_user;
END $$;
-- Эта функция должна вызываться только из Edge Function через service_role.
REVOKE EXECUTE ON FUNCTION telegram_link_chat(TEXT, BIGINT, TEXT) FROM authenticated, anon;

-- Юзер может отключить (удалить линк)
CREATE OR REPLACE FUNCTION telegram_unlink()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM user_telegram_links WHERE user_id = auth.uid();
END $$;
GRANT EXECUTE ON FUNCTION telegram_unlink() TO authenticated;

-- Узнаём статус: подключён ли TG
CREATE OR REPLACE FUNCTION telegram_status()
RETURNS TABLE(linked BOOLEAN, username TEXT, linked_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT TRUE, l.username, l.linked_at
    FROM user_telegram_links l WHERE l.user_id = auth.uid()
    UNION ALL
    SELECT FALSE, NULL::TEXT, NULL::TIMESTAMPTZ
    WHERE NOT EXISTS (SELECT 1 FROM user_telegram_links WHERE user_id = auth.uid())
    LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION telegram_status() TO authenticated;
