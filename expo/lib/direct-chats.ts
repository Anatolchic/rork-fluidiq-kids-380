import supabase from './supabase';

export async function openDirectChat(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_direct_chat', { p_other_user: otherUserId });
  if (error) throw error;
  return data as string;
}

export type DirectChatRow = {
  id: string;
  student_id: string;
  tutor_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  student_unread: number;
  tutor_unread: number;
};

export async function loadDirectChatsForStudent(studentId: string) {
  return supabase
    .from('direct_chats')
    .select('*')
    .eq('student_id', studentId)
    .order('last_message_at', { ascending: false });
}

export async function loadDirectChatsForTutor(tutorId: string) {
  return supabase
    .from('direct_chats')
    .select('*')
    .eq('tutor_id', tutorId)
    .order('last_message_at', { ascending: false });
}

export async function markRead(chatId: string) {
  return supabase.rpc('mark_direct_chat_read', { p_chat_id: chatId });
}
