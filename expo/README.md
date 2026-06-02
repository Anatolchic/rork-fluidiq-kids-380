# Репетиторы — мобильное и веб-приложение

Платформа для поиска репетиторов и проведения онлайн-уроков. iOS / Android / Web из одной кодовой базы (Expo + React Native + expo-router).

## Что работает

- **Прод:** `https://repetitory-app.ru` (лендинг) и `https://web.repetitory-app.ru` (PWA web-сборка)
- **Supabase self-hosted:** `https://supabase.repetitory-app.ru` (API + Auth + Storage + Realtime + Edge Functions)
- **Сервер:** Beget VPS `5.35.86.239` (чистый российский IP — критично, см. `memory/project_repetitory.md`)
- **DNS:** все домены A-записями напрямую на `5.35.86.239` (без Cloudflare proxy — DPI режет грязные IP)
- **Reverse-proxy:** Caddy с auto-SSL (Let's Encrypt) для всех поддоменов
- **Мобильная сборка:** через EAS, bundle id `ru.repetitory.app`, репо `Anatolchic/rork-fluidiq-kids-380`

## Стек

- **Frontend:** Expo SDK 54, React Native, expo-router (file-based), TypeScript
- **State:** zustand (`stores/auth.ts`)
- **UI:** react-native-svg, lucide-react-native, date-fns + ru locale
- **Backend:** Supabase self-hosted (Postgres 15 + GoTrue + PostgREST + Realtime + Storage + Edge Functions on Deno)
- **Платежи:** T-Bank (Tinkoff) Acquiring — пополнение баланса репетиторов, webhook `tbank-webhook`
- **WebRTC:** P2P звонки через `expo-webrtc`, TURN-сервер на `5.35.87.176`

## Архитектура

### Роли
- `admin` — админ-панель, модерация
- `tutor` — публикуется в каталоге, ведёт уроки, получает деньги от учеников напрямую, платит платформе комиссию с баланса
- `student` — ищет репетитора, бронирует, оценивает

Одна `auth.users` запись — одна роль. Профили в отдельных таблицах: `tutor_profiles`, `student_profiles`, `user_roles`.

### Деньги в копейках
Все суммы в БД хранятся в `*_kopecks INT`. Отображение: `${(value/100).toLocaleString("ru")} ₽`.

### Структура файлов

```
expo/
├── app/                              # Expo Router (file-based)
│   ├── (admin)/                      # Админ-панель (sidebar на desktop, Tabs на mobile)
│   │   ├── _layout.tsx               # Layout с проверкой role='admin'
│   │   ├── index.tsx                 # Дашборд: метрики, графики
│   │   ├── users.tsx                 # Поиск пользователей по role
│   │   ├── tutors.tsx                # Список репетиторов
│   │   ├── bookings.tsx              # Все сделки
│   │   ├── payments.tsx              # Платежи / выплаты
│   │   ├── tickets.tsx               # Обращения в поддержку
│   │   ├── verifications.tsx         # Очередь модерации документов
│   │   ├── audit.tsx                 # Журнал admin_audit_log
│   │   ├── settings.tsx              # app_settings (цены, T-Bank, test_mode)
│   │   └── profile.tsx
│   ├── (tutor)/                      # Кабинет репетитора
│   ├── (student)/                    # Кабинет ученика
│   ├── (auth)/                       # Логин / регистрация / восстановление
│   ├── admin-user/[id].tsx           # Карточка пользователя
│   ├── booking/                      # Сделки
│   ├── call/                         # Видеозвонок (WebRTC)
│   ├── chat/                         # Чат
│   ├── review/                       # Отзывы
│   ├── tutor/                        # Публичный профиль репетитора
│   ├── tutor-setup.tsx               # Онбординг репетитора
│   ├── verification.tsx              # Подача документов на верификацию
│   └── support.tsx                   # Связь с поддержкой
├── components/
│   ├── AvatarPicker.tsx              # Выбор/смена аватара (Supabase Storage)
│   ├── CalendarMonth.tsx             # Месячный календарь со слотами
│   ├── NotificationBell.tsx          # Колокольчик + список уведомлений
│   └── SettingsSection.tsx           # Переиспользуемая карточка настроек
├── lib/
│   ├── supabase.ts                   # Клиент (URL + anon из env)
│   ├── constants.ts                  # COLORS, SUBJECTS, LEVELS, длительности
│   ├── errors.ts                     # ru() — перевод ошибок Postgres/Auth
│   ├── responsive.ts                 # useResponsive() — breakpoints + maxWidth
│   ├── bookings.ts                   # loadBookings/attachProfiles (FK на auth.users)
│   ├── notifications.ts              # Локальные уведомления
│   ├── pagination.ts                 # Cursor pagination
│   ├── tbank.ts                      # Helpers для T-Bank
│   ├── biometric.ts                  # Face/Touch ID (Expo LocalAuth)
│   ├── webrtc.ts                     # Сигналинг + TURN
│   ├── Chart.tsx                     # SVG-графики
│   └── Skeleton.tsx                  # Скелетоны
├── stores/
│   └── auth.ts                       # zustand: session, profile, role
└── supabase/
    ├── migrations/                   # SQL миграции (хронология ниже)
    └── functions/
        └── calendar-ics/             # ICS-экспорт уроков
```

## Ключевые миграции

| Файл | Что в нём |
|---|---|
| `20260531_admin_policies_functions.sql` | RLS, is_admin(), admin_list_users, базовые RPC |
| `20260531_triggers_and_pg_cron.sql` | pg_cron задачи (напоминалки, авто-завершение) |
| `20260531_chat_read_admin_charts.sql` | Чат + read receipts + графики |
| `20260531_chat_attachments_bucket.sql` | Storage bucket для вложений |
| `20260531_avatars_bucket_and_dev_topup.sql` | Storage bucket аватарок + dev-пополнение баланса |
| `20260531_support_tickets.sql` | support_tickets + сообщения |
| `20260601_notification_prefs.sql` | Настройки уведомлений |
| `20260602_notifications_and_avatars.sql` | notifications, mark_*_read RPC, аватары |
| `20260602_chat_improvements.sql` | Улучшения чата |
| `20260602_telegram_link.sql` | Привязка Telegram |
| `20260602_big_features.sql` | **Главная миграция.** admin_audit_log, promo_codes + apply_promo_code, tutor_subscriptions + buy_pro_subscription/is_pro_tutor, tutor_certifications + request_verification/admin_review_certification, tutor_profiles.is_verified/balance/lesson_break_minutes, tutor_availability.specific_date/price_per_hour_override, booking_series + bookings.series_id/is_intro, student_profiles.birth_date/parent_*, user_roles.banned_at/deleted_at, app_settings.verification_price_kopecks/pro_subscription_price_kopecks |

## Ключевые БД-объекты

- `app_settings` (single-row): `lesson_commission`, `min_balance_to_start`, `tbank_*`, `test_mode`, `verification_price_kopecks`, `pro_subscription_price_kopecks`
- `admin_audit_log` + RPC `log_admin_action(action, table, target, payload)`
- `promo_codes` / `promo_code_uses` + RPC `apply_promo_code(code, base_kopecks, target)`
- `tutor_subscriptions` + RPC `buy_pro_subscription(months)`, `is_pro_tutor(uid)`
- `tutor_certifications` (kind: passport/diploma/certificate/other; status: draft/pending/approved/rejected) + RPC `request_verification(cert_ids[])`, `admin_review_certification(id, approve, reason)`
- `notifications` + RPC `mark_notification_read`, `mark_all_read`
- `booking_series` (рекурренты) → `bookings.series_id`
- `tutor_availability.specific_date` (точечные слоты вне обычного расписания) + `price_per_hour_override`

## Связи

- **T-Bank Acquiring** → webhook `https://supabase.repetitory-app.ru/functions/v1/tbank-webhook`
- **Telegram** → привязка через `auth_link_telegram` (см. `20260602_telegram_link.sql`)
- **TURN** → `turn:5.35.87.176:3478` (для WebRTC)
- **Repo:** `github.com/Anatolchic/rork-fluidiq-kids-380` (приватный)
- **VPS:** `root@5.35.86.239` (Beget); vault `repetitory-prod`

## Деплой

### Web
```bash
bun run build:web              # Expo Web → dist/
# деплой dist/ на VPS под Caddy, домен web.repetitory-app.ru
```

### Mobile (EAS)
```bash
eas build --platform ios       # → TestFlight
eas build --platform android   # → Internal Track
eas submit --platform ios
eas submit --platform android
```

Bundle: `ru.repetitory.app`. Apple/Google credentials в EAS.

### Supabase
```bash
# Локально → продакшен
supabase db push               # миграции
supabase functions deploy <name>
```

## Окружение (env)

```env
EXPO_PUBLIC_SUPABASE_URL=https://supabase.repetitory-app.ru
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Сервисные ключи (service_role, T-Bank secrets) — только на VPS, через env Edge Functions.

## Что НЕ сделано / следующие шаги

- Push-уведомления (Expo Notifications) — каркас есть, нужен прод-проект FCM/APNs
- iOS submit — нужны APN-сертификаты
- Партнёрская программа репетиторов
- Видеозапись уроков (сейчас только live-звонок)

## Уроки

- **Чистый RU origin-IP** обязателен — DPI режет «грязные» IP. Никаких Cloudflare proxy для api/auth/storage. См. `memory/project_repetitory.md`.
- **FK bookings на auth.users** — не работает PostgREST embed `tutor:tutor_profiles!tutor_id(*)`. Подгружаем профили отдельным запросом через `lib/bookings.attachProfiles()`.
- **Цены в копейках везде** — никаких float, никаких `.toFixed(2)` при сохранении.
- **`ru(error)`** в каждом Alert — иначе пользователь видит англоязычные тех-сообщения.
