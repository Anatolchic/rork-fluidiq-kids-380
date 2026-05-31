// Адаптация под экраны. Используем useWindowDimensions() + breakpoints.
// Применяется во всех экранах для max-width контейнеров, grid колонок и
// переключения mobile-tabs ↔ desktop-sidebar в админке.

import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  sm: 480,   // телефон
  md: 768,   // планшет (вертикально)
  lg: 1024,  // планшет горизонтально / маленький десктоп
  xl: 1280,  // большой десктоп
} as const;

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const bp: Breakpoint =
    width >= BREAKPOINTS.xl ? 'xl' :
    width >= BREAKPOINTS.lg ? 'lg' :
    width >= BREAKPOINTS.md ? 'md' : 'sm';

  return {
    width, height, isLandscape, bp,
    isMobile: bp === 'sm',
    isTablet: bp === 'md',
    isDesktop: bp === 'lg' || bp === 'xl',
    isLarge: bp === 'xl',

    // Максимальная ширина основного контента (центрируется)
    contentMaxWidth:
      bp === 'sm' ? '100%' as any :
      bp === 'md' ? 640 :
      bp === 'lg' ? 880 : 1120,

    // Количество колонок в grid для каталога/dashboard
    gridCols:
      bp === 'sm' ? 1 :
      bp === 'md' ? 2 :
      bp === 'lg' ? 3 : 4,

    // Padding для основного контента
    contentPadding: bp === 'sm' ? 16 : bp === 'md' ? 20 : 24,
  };
}

// Хелпер для центрированного контейнера на больших экранах
export function centered<T extends Record<string, any>>(maxWidth: number | string): T {
  return { maxWidth, width: '100%', marginLeft: 'auto', marginRight: 'auto' } as any;
}
