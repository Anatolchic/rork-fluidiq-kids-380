import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, Platform, Modal, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'lucide-react-native';
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
  const [viewerOpen, setViewerOpen] = useState(false);

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

      let body: any;
      if (Platform.OS === 'web') {
        body = await (await fetch(uri)).blob();
      } else {
        const fd = new FormData();
        fd.append('file', { uri, name: `avatar.${ext}`, type: contentType } as any);
        body = fd;
      }

      const { error } = await supabase.storage.from('avatars').upload(filename, body, { contentType, upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
      onUpdate(data.publicUrl);
    } catch (e: any) {
      Alert.alert('Не удалось загрузить фото', ru(e));
    } finally {
      setUploading(false);
    }
  }

  function handlePress() {
    // Тап по аватарке — если есть фото, открывается viewer; если нет — сразу picker
    if (photoUrl) setViewerOpen(true);
    else pick();
  }

  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
  const imgSize = Math.min(screenW - 32, screenH - 200);

  return (
    <>
      <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={{ width: size, height: size, borderRadius: size / 2 }}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]} />
          ) : (
            <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
              <Text style={[styles.letter, { fontSize: size / 2.5 }]}>{(name || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.editBadge} onPress={pick} disabled={uploading} activeOpacity={0.8}>
          {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={14} color="#fff" />}
        </TouchableOpacity>
      </View>

      <Modal visible={viewerOpen} animationType="fade" transparent onRequestClose={() => setViewerOpen(false)}>
        <TouchableOpacity style={styles.viewerBg} activeOpacity={1} onPress={() => setViewerOpen(false)}>
          {photoUrl && (
            <Image source={{ uri: photoUrl }} style={{ width: imgSize, height: imgSize, borderRadius: 16 }} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerOpen(false)}>
            <X size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.viewerChange} onPress={() => { setViewerOpen(false); setTimeout(pick, 200); }}>
            <Camera size={18} color="#fff" />
            <Text style={styles.viewerChangeText}>Изменить</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', position: 'relative' },
  img: { backgroundColor: COLORS.primaryLight },
  placeholder: { backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  letter: { fontWeight: '700', color: COLORS.primary },
  editBadge: { position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  viewerClose: { position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff20', justifyContent: 'center', alignItems: 'center' },
  viewerChange: { position: 'absolute', bottom: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: '#ffffff20', borderWidth: 1, borderColor: '#ffffff40' },
  viewerChangeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
