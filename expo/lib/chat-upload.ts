import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import supabase from './supabase';

export type UploadedAttachment = {
  type: 'image' | 'file';
  file_url: string;
  file_name: string;
  size: number;
};

async function uriToBlob(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    return await resp.blob();
  }
  const resp = await fetch(uri);
  return await resp.blob();
}

export async function uploadToChatBucket(
  ownerId: string,
  uri: string,
  fileName: string,
  mimeType: string | undefined,
  type: 'image' | 'file',
): Promise<UploadedAttachment> {
  const ext = (fileName.split('.').pop() || (type === 'image' ? 'jpg' : 'bin')).toLowerCase();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await uriToBlob(uri);
  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, blob, {
      contentType: mimeType || (type === 'image' ? 'image/jpeg' : 'application/octet-stream'),
      upsert: false,
    });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path);
  return { type, file_url: publicUrl, file_name: safeName, size: (blob as any).size || 0 };
}

export async function pickAndUploadImage(ownerId: string): Promise<UploadedAttachment | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('Нет доступа к фото');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return uploadToChatBucket(ownerId, a.uri, a.fileName || `photo-${Date.now()}.jpg`, a.mimeType, 'image');
}

export async function pickAndUploadDocument(ownerId: string): Promise<UploadedAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: '*/*' });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return uploadToChatBucket(ownerId, a.uri, a.name || `file-${Date.now()}`, a.mimeType, 'file');
}
