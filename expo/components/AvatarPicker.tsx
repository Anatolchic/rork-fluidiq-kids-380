import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import supabase from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { ru } from '../lib/errors';

type Props = {
  userId: string;
  photoUrl: string | null | undefined;
  name?: string | null;
  onUpdate: (url: string) => void;
  size?: number;
};

export default function AvatarPicker({ userId, photoUrl, name, onUpdate, size = 96 }: Props) {
  const [uploading, setUploading] = useState(false);

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Нет доступа к фото'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;

    setUploading(true);
    try {
      const asset = res.assets[0];
      const uri = asset.uri;
      const extGuess = (uri.split('.').pop() || asset.fileName?.split('.').pop() || 'jpg').toLowerCase().replace(/^jpeg$/, 'jpg');
      const ext = ['jpg', 'png', 'webp'].includes(extGuess) ? extGuess : 'jpg';
      const filename = `${userId}/${Date.now()}.${ext}`;
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      // На native fetch(uri) → blob может зависнуть в Expo Go.
      // Используем ArrayBuffer через FileReader или Uri response.
      let body: any;
      if (Platform.OS === 'web') {
        body = await (await fetch(uri)).blob();
      } else {
        // FormData с file uri — самый стабильный путь на iOS/Android в Expo Go
        const fd = new FormData();
        fd.append('file', { uri, name: `avatar.${ext}`, type: contentType } as any);
        body = fd;
      }

      const { error } = await supabase.storage.from('avatars').upload(filename, body, {
        contentType,
        upsert: true,
      });
      if (error) throw error;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
      onUpdate(data.publicUrl);
    } catch (e: any) {
      Alert.alert('Не удалось загрузить фото', ru(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <TouchableOpacity style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]} onPress={pick} disabled={uploading} activeOpacity={0.7}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.letter, { fontSize: size / 2.5 }]}>{(name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={[styles.editBadge, { right: 0, bottom: 0 }]}>
        {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={14} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', position: 'relative' },
  img: { backgroundColor: COLORS.primaryLight },
  placeholder: { backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  letter: { fontWeight: '700', color: COLORS.primary },
  editBadge: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
});
