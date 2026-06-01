// Перевод частых ошибок Supabase Auth и Postgres на русский.
// supabaseError(e).message — короткое русское описание, годное для Alert.

const MAP: { match: RegExp | string; ru: string }[] = [
  // Auth
  { match: /invalid login credentials/i, ru: 'Неверный email или пароль' },
  { match: /email not confirmed/i, ru: 'Email не подтверждён. Проверьте почту' },
  { match: /user already registered/i, ru: 'Пользователь с таким email уже зарегистрирован' },
  { match: /user not found/i, ru: 'Пользователь не найден' },
  { match: /password should be at least/i, ru: 'Пароль слишком короткий (минимум 6 символов)' },
  { match: /unable to validate email address/i, ru: 'Неверный формат email' },
  { match: /email rate limit/i, ru: 'Слишком много писем за короткое время. Попробуйте через минуту' },
  { match: /signups not allowed/i, ru: 'Регистрация временно отключена' },
  { match: /rate limit/i, ru: 'Превышен лимит запросов. Попробуйте позже' },
  { match: /invalid refresh token/i, ru: 'Сессия истекла. Войдите снова' },
  { match: /token has expired/i, ru: 'Срок действия токена истёк' },
  { match: /weak[_ ]password/i, ru: 'Пароль слишком простой. Используйте буквы, цифры и символы' },
  { match: /same password/i, ru: 'Новый пароль должен отличаться от текущего' },
  { match: /captcha verification/i, ru: 'Не удалось пройти проверку безопасности' },
  // RLS / Postgres
  { match: /permission denied/i, ru: 'Недостаточно прав для этого действия' },
  { match: /row.level security/i, ru: 'Доступ запрещён политикой безопасности' },
  { match: /duplicate key value/i, ru: 'Запись с такими данными уже существует' },
  { match: /violates foreign key/i, ru: 'Связанная запись не найдена' },
  { match: /violates not.null/i, ru: 'Не заполнены обязательные поля' },
  { match: /violates check constraint/i, ru: 'Данные не прошли проверку' },
  // Network
  { match: /network request failed/i, ru: 'Ошибка соединения. Проверьте интернет' },
  { match: /failed to fetch/i, ru: 'Не удалось связаться с сервером' },
  { match: /timeout/i, ru: 'Превышено время ожидания' },
  // Storage
  { match: /the resource already exists/i, ru: 'Файл с таким именем уже существует' },
  { match: /payload too large/i, ru: 'Файл слишком большой' },
  { match: /mime type.*not.*allowed/i, ru: 'Этот тип файла не разрешён' },
  // Edge functions
  { match: /function .* not found/i, ru: 'Сервис недоступен' },
  { match: /no api key/i, ru: 'Сессия истекла. Перезайдите в приложение' },
];

export function ru(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as any)?.message ?? error);
  if (!raw) return 'Неизвестная ошибка';
  for (const m of MAP) {
    if (typeof m.match === 'string' ? raw.toLowerCase().includes(m.match.toLowerCase()) : m.match.test(raw)) {
      return m.ru;
    }
  }
  return raw;
}
