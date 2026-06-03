# Web Push: настройка VAPID

Web Push (для платформы web в Expo) требует пары VAPID-ключей. Это одноразовая операция на проект — пара живёт долго.

## 1. Сгенерировать ключи

```bash
npx web-push generate-vapid-keys
```

Получишь:

```
=======================================
Public Key:
B...                  ← base64url, ~87 символов
Private Key:
x...                  ← base64url, ~43 символа
=======================================
```

Сохрани оба значения в надёжное место (vault, не git).

## 2. Клиент (Expo / браузер)

В `.env` (и в `.env.production` если используется) добавь:

```
EXPO_PUBLIC_VAPID_PUBLIC_KEY=<public_key>
```

Только **публичный** ключ. Приватный на клиент не попадает.

При следующей пересборке web-бандла `lib/web-push.ts` подхватит ключ и сможет подписывать пользователей.

## 3. Supabase Edge Function (notify-web-push)

Прописываем секреты для функции:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="<public_key>" \
  VAPID_PRIVATE_KEY="<private_key>" \
  VAPID_EMAIL="admin@repetitory-app.ru"
```

Развернуть функцию:

```bash
supabase functions deploy notify-web-push
```

## 4. Миграция

Накатить:

```
supabase/migrations/20260602_web_push.sql
```

Она добавляет колонку `push_tokens.platform` (`'expo' | 'web'`) и индекс `(user_id, platform)`.

## 5. Проверка

1. Открой web-версию приложения, разреши уведомления.
2. В таблице `push_tokens` появится запись `platform='web'` с JSON-подпиской в `token`.
3. Вызови функцию вручную:

```bash
curl -X POST https://supabase.repetitory-app.ru/functions/v1/notify-web-push \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<uuid>","title":"Тест","body":"Привет","url":"/"}'
```

Браузер покажет уведомление. Клик откроет `/` (или то, что в `url`).

## Заметки

- Если поменяете VAPID-ключи — все старые web-подписки перестанут работать. Нужно будет передоговориться с пользователями (Notification.permission останется granted, но subscribe() придётся повторить).
- `EXPO_PUBLIC_*` переменные публичные — но публичный VAPID ключ для того и нужен, что показывается клиенту, утечки нет.
- Native Expo Push идёт по-прежнему через `getExpoPushTokenAsync` и сохраняется с `platform='ios' | 'android'`. Web — отдельный канал.
