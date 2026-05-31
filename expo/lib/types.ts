export type UserRole = 'student' | 'tutor' | 'admin';
export type Subject = 'Математика'|'Физика'|'Химия'|'Биология'|'История'|'География'|'Литература'|'Русский язык'|'Английский язык'|'Немецкий язык'|'Французский язык'|'Информатика'|'Обществознание'|'Экономика'|'Право'|'Музыка'|'Рисование'|'Шахматы'|'Другое';
export type Level = 'Дошкольник'|'Школьник (1-4 класс)'|'Школьник (5-9 класс)'|'Подготовка к ОГЭ'|'Подготовка к ЕГЭ'|'Студент'|'Взрослый';
export type LessonDuration = 30 | 45 | 60 | 90;
export type BookingStatus = 'pending'|'confirmed'|'active'|'completed'|'cancelled';
export type PaymentMethod = 'card'|'phone'|'bank'|'phone_top'|'other';

export interface User { id: string; email: string; role: UserRole; created_at: string; }
export interface TutorProfile {
  id: string; user_id: string; name: string; photo_url: string|null; bio: string;
  subjects: Subject[]; levels: Level[]; price_per_hour: number; min_duration: LessonDuration;
  experience_years: number; education: string; auto_confirm: boolean; balance: number;
  rating: number; reviews_count: number; payment_method: PaymentMethod;
  payment_details: string; is_published: boolean; created_at: string;
}
export interface StudentProfile { id: string; user_id: string; name: string; photo_url: string|null; favorites: string[]; created_at: string; }
export interface TutorAvailability { id: string; tutor_id: string; day_of_week: number; start_time: string; end_time: string; }
export interface Booking {
  id: string; student_id: string; tutor_id: string; subject: Subject; level: Level;
  start_time: string; end_time: string; duration: LessonDuration; topic: string|null;
  status: BookingStatus; price: number; commission: number; created_at: string;
  tutor?: TutorProfile; student?: StudentProfile;
}
export interface ChatRoom { id: string; booking_id: string; student_id: string; tutor_id: string; created_at: string; }
export interface Message { id: string; room_id: string; sender_id: string; content: string; type: 'text'|'image'|'file'; file_url: string|null; file_name: string|null; created_at: string; }
export interface Review { id: string; booking_id: string; tutor_id: string; student_id: string; rating: number; comment: string; tutor_reply: string|null; created_at: string; student?: StudentProfile; }
export interface Payment { id: string; tutor_id: string; amount: number; type: 'topup'|'commission'|'refund'; status: 'pending'|'completed'|'failed'; tbank_order_id: string|null; description: string; created_at: string; }
export interface AppSettings { id: string; lesson_commission: number; min_balance_to_start: number; tbank_terminal_id: string; updated_at: string; }
export interface WebRTCSignal { id: string; booking_id: string; from_user: string; to_user: string; type: 'offer'|'answer'|'ice-candidate'|'call-request'|'call-accepted'|'call-rejected'|'call-ended'; data: string; created_at: string; }
