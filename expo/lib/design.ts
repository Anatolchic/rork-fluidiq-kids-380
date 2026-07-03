/**
 * Design tokens — единые тени, радиусы, отступы и семантические цвета.
 * Используется вместо повторяющихся `borderRadius: 16` и inline-shadow.
 */

import { COLORS } from './constants';

export const RADIUS = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  round: 999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Мягкая тень для карточек — не бросающаяся в глаза, но даёт «air». */
export const SHADOW_CARD = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

/** Более выраженная тень для приподнятых элементов (bottom-bar, sticky). */
export const SHADOW_ELEVATED = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 8,
} as const;

/** Цветная тень для CTA кнопок с primary-градиентом. */
export const SHADOW_PRIMARY = {
  shadowColor: COLORS.primary,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.25,
  shadowRadius: 12,
  elevation: 4,
} as const;

/** Полупрозрачные акценты — используются для фонов и borders. */
export const TINT = {
  primary08: COLORS.primary + '14',   // ~8%
  primary15: COLORS.primary + '26',   // ~15%
  primary25: COLORS.primary + '40',   // ~25%
  success10: COLORS.success + '1A',
  warning10: COLORS.warning + '1A',
  error10: COLORS.error + '1A',
  neutral: '#0000000A',
} as const;

/** Готовые стили для типовых элементов. */
export const CARD_STYLE = {
  backgroundColor: COLORS.white,
  borderRadius: RADIUS.lg,
  padding: SPACING.lg,
  ...SHADOW_CARD,
} as const;

export const CHIP_STYLE = {
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.sm,
  borderRadius: RADIUS.md,
  backgroundColor: COLORS.white,
  borderWidth: 1,
  borderColor: COLORS.border,
} as const;

export const PILL_STYLE = {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: RADIUS.md,
  backgroundColor: COLORS.white,
  borderWidth: 1,
  borderColor: COLORS.border,
} as const;

/** Градиент primary — единый для всех CTA. */
export const GRADIENT_PRIMARY = [COLORS.primary, '#8B7FFF'] as const;
export const GRADIENT_START = { x: 0, y: 0 } as const;
export const GRADIENT_END = { x: 1, y: 1 } as const;
