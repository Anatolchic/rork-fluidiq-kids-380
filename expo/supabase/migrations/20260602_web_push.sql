-- Web Push: маркируем подписки по платформе + индекс для быстрой выборки
-- в Edge Function notify-web-push.
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'expo';
CREATE INDEX IF NOT EXISTS push_tokens_user_platform_idx ON public.push_tokens(user_id, platform);
