export const SUBJECTS = ['Математика','Физика','Химия','Биология','История','География','Литература','Русский язык','Английский язык','Немецкий язык','Французский язык','Информатика','Обществознание','Экономика','Право','Музыка','Рисование','Шахматы','Другое'];
export const LEVELS = ['Дошкольник','Школьник (1-4 класс)','Школьник (5-9 класс)','Подготовка к ОГЭ','Подготовка к ЕГЭ','Студент','Взрослый'];
// Слоты кратные 30 минутам. Реальный урок = slot - lesson_break_minutes (по умолчанию 10).
// Например при slot=60: «1 час (50 мин урок + 10 мин перерыв)».
export const LESSON_DURATIONS = [
  { label: '30 мин', value: 30 },
  { label: '60 мин', value: 60 },
  { label: '90 мин', value: 90 },
  { label: '120 мин', value: 120 },
] as const;
export const SLOT_STEP_MINUTES = 30;
export const DEFAULT_LESSON_BREAK = 10;
export function formatLessonDuration(slot: number, breakMin: number = DEFAULT_LESSON_BREAK): string {
  const lesson = Math.max(slot - breakMin, slot);
  if (slot <= breakMin || lesson === slot) return `${slot} мин`;
  return `${slot} мин (${slot - breakMin} мин урок + ${breakMin} мин перерыв)`;
}
export const PAYMENT_METHODS = [{value:'card',label:'Перевод на карту'},{value:'phone',label:'По номеру телефона'},{value:'bank',label:'По реквизитам банка'},{value:'phone_top',label:'Пополнение телефона'},{value:'other',label:'Другой способ'}] as const;
export const BOOKING_STATUS_LABELS: Record<string,string> = {pending:'Ожидает подтверждения',confirmed:'Подтверждено',active:'Идёт урок',completed:'Завершён',cancelled:'Отменён'};
export const DAY_NAMES = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
export const DAY_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
export const COLORS = {
  primary:'#6C63FF', primaryLight:'#EEF0FF', secondary:'#FF6584',
  success:'#4CAF50', warning:'#FF9800', error:'#F44336',
  text:'#1A1A2E', textSecondary:'#666680', border:'#E8E8F0',
  background:'#F8F9FF', white:'#FFFFFF', card:'#FFFFFF', star:'#FFD700',
};
export const TURN_IP = '5.35.87.176';
export const MIN_BALANCE_KOPECKS = 20000;
export const COMMISSION_KOPECKS = 20000;

export const PLATFORM_RULES = `Правила платформы «Репетиторы»

1. Платформа предоставляет сервис поиска репетиторов и инструменты для проведения онлайн-уроков (видеосвязь, чат).

2. Комиссия платформы — фиксированная сумма за каждый проведённый урок. Размер комиссии указан в личном кабинете.

3. Оплата за услуги репетитора производится напрямую между учеником и репетитором удобным им способом. Платформа не является посредником в расчётах.

4. Репетитор самостоятельно несёт ответственность за уплату налогов в соответствии с законодательством РФ.

5. Репетитор обязан предоставлять достоверную информацию о своей квалификации и опыте.

6. Платформа оставляет за собой право отклонить профиль, не соответствующий требованиям.`;
