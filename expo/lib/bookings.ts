// Helper для загрузки bookings с присоединёнными tutor/student профилями.
// FK на bookings ведут на auth.users, поэтому Postgrest не строит embed
// `tutor:tutor_profiles!tutor_id(*)` — делаем отдельные запросы.

import supabase from './supabase';
import { Booking } from './types';

export type BookingWithParticipants = Booking & {
  tutor: any | null;
  student: any | null;
};

export async function attachProfiles(bookings: Booking[]): Promise<BookingWithParticipants[]> {
  if (!bookings?.length) return [];
  const tutorIds = [...new Set(bookings.map(b => b.tutor_id))];
  const studentIds = [...new Set(bookings.map(b => b.student_id))];
  const [t, s] = await Promise.all([
    supabase.from('tutor_profiles').select('*').in('user_id', tutorIds),
    supabase.from('student_profiles').select('*').in('user_id', studentIds),
  ]);
  const tutorMap: Record<string, any> = {};
  (t.data || []).forEach(p => { tutorMap[p.user_id] = p; });
  const studentMap: Record<string, any> = {};
  (s.data || []).forEach(p => { studentMap[p.user_id] = p; });
  return bookings.map(b => ({
    ...b,
    tutor: tutorMap[b.tutor_id] || null,
    student: studentMap[b.student_id] || null,
  }));
}

export async function loadBookings(query: any): Promise<BookingWithParticipants[]> {
  const { data, error } = await query;
  if (error) { console.warn('[loadBookings] err', error); return []; }
  return attachProfiles(data || []);
}
