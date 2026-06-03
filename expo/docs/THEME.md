# Тёмная тема

## Текущий статус
- Хранилище режима темы — `stores/theme.ts` (`useThemeStore`), persist через AsyncStorage, ключ `theme`
- Палитры — `lib/theme.ts`: `LIGHT_COLORS` и `DARK_COLORS` одинаковой формы (`ColorSet`)
- Хук `useColors()` из `lib/theme.ts` возвращает текущий `ColorSet` с учётом mode + системной темы
- UI переключения — в `components/SettingsSection.tsx`, секция «Тема оформления» с тремя радио-кнопками (Система / Светлая / Тёмная)
- Подключена к экранам профиля Student / Tutor / Admin (через `SettingsSection`)
- `COLORS` в `lib/constants.ts` остался — это light-палитра для обратной совместимости. Все существующие экраны работают как раньше

## Режимы
| value | поведение |
|---|---|
| `system` | следует за `useColorScheme()` (iOS / Android / web prefers-color-scheme) |
| `light` | принудительно светлая |
| `dark` | принудительно тёмная |

По умолчанию — `system`.

## Перевод экрана на динамическую палитру

`StyleSheet.create` создаётся один раз и не реагирует на смену темы. Поэтому два рабочих варианта:

### Вариант 1 — стили внутри компонента (рекомендуется для экранов где много цветов)

```tsx
import { useColors } from '../../lib/theme';

export default function MyScreen() {
  const c = useColors();
  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    title: { fontSize: 20, color: c.text },
  }), [c]);
  // ...
}
```

### Вариант 2 — инлайн-стили для цветов (для маленьких компонентов)

```tsx
import { useColors } from '../../lib/theme';

export function Badge({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={[s.badge, { backgroundColor: c.primary + '15' }]}>
      <Text style={{ color: c.primary }}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
```

### Чеклист переезда экрана
1. Удалить `import { COLORS } from '../../lib/constants'` (или оставить, если ещё нужны не-цветовые экспорты — но цвета не использовать)
2. Внутри компонента — `const c = useColors()`
3. В стилях заменить `COLORS.xxx` на `c.xxx` (через `useMemo` или инлайн)
4. Проверить визуал в обеих темах: переключить в Настройках → Тема оформления

## Палитра

`ColorSet` (полный список ключей, должен совпадать в LIGHT_COLORS и DARK_COLORS):
`primary`, `primaryDark`, `primaryLight`, `secondary`, `background`, `white`, `surface`, `card`, `text`, `textSecondary`, `border`, `success`, `warning`, `error`, `star`.

Прозрачности — через суффикс `+ '15'` (8%), `+ '40'` (25%) и т.п. Работает с обоими наборами.

## TODO (отдельная волна)
- Перевести все экраны на `useColors()`. Кандидаты с большим количеством цвета:
  - `app/(student)/index.tsx`, `app/(tutor)/index.tsx`, `app/(admin)/index.tsx`
  - `app/call/[id].tsx`, `app/chat/[id].tsx`
  - `app/(auth)/login.tsx`, `app/(auth)/register.tsx`
  - Компоненты `CalendarMonth`, `Chart`, `NotificationBell`, `Skeleton`
- При переезде статусной строки — `useIsDark()` из `lib/theme.ts` + `<StatusBar style={isDark ? 'light' : 'dark'} />`
- После полного переезда — постепенно удалить экспорт `COLORS` из `lib/constants.ts`
