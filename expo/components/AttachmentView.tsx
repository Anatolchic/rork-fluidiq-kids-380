import { View, Text, Image, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { FileText, Download } from 'lucide-react-native';
import { COLORS } from '../lib/constants';

type Props = {
  fileUrl: string;
  fileName?: string | null;
  type?: string | null;
  isOwn?: boolean;
};

function isImageUrl(url: string, type?: string | null): boolean {
  if (type === 'image') return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic)(\?|$)/i.test(url);
}

export function AttachmentView({ fileUrl, fileName, type, isOwn }: Props) {
  if (!fileUrl) return null;
  const isImage = isImageUrl(fileUrl, type);
  function open() {
    if (Platform.OS === 'web') window.open(fileUrl, '_blank');
    else Linking.openURL(fileUrl);
  }
  if (isImage) {
    return (
      <TouchableOpacity onPress={open} activeOpacity={0.85} style={{ marginTop: 4 }}>
        <Image source={{ uri: fileUrl }} style={styles.image} resizeMode="cover" />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={open} activeOpacity={0.7} style={[styles.fileRow, isOwn && styles.fileRowOwn]}>
      <View style={[styles.icoBox, isOwn && styles.icoBoxOwn]}>
        <FileText size={20} color={isOwn ? '#fff' : COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, isOwn && { color: '#fff' }]} numberOfLines={2}>{fileName || 'Файл'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Download size={11} color={isOwn ? '#FFFFFFB3' : COLORS.textSecondary} />
          <Text style={[styles.hint, isOwn && { color: '#FFFFFFB3' }]}>Скачать</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  image: { width: 220, height: 220, borderRadius: 14, backgroundColor: COLORS.background },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 12,
    backgroundColor: COLORS.background,
    marginTop: 4, maxWidth: 280,
  },
  fileRowOwn: { backgroundColor: '#FFFFFF22' },
  icoBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  icoBoxOwn: { backgroundColor: '#FFFFFF33' },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  hint: { fontSize: 11, color: COLORS.textSecondary },
});
