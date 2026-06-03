import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, StyleSheet, Alert } from 'react-native';
import { Paperclip, Image as ImageIcon, FileText, X } from 'lucide-react-native';
import { COLORS } from '../lib/constants';
import { pickAndUploadImage, pickAndUploadDocument, UploadedAttachment } from '../lib/chat-upload';

type Props = {
  ownerId: string;
  onUploaded: (att: UploadedAttachment) => void;
};

export function AttachmentBar({ ownerId, onUploaded }: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handle(kind: 'image' | 'file') {
    setOpen(false);
    setUploading(true);
    try {
      const res = kind === 'image' ? await pickAndUploadImage(ownerId) : await pickAndUploadDocument(ownerId);
      if (res) onUploaded(res);
    } catch (e: any) {
      Alert.alert('Ошибка', String(e?.message || e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} disabled={uploading} style={styles.btn} accessibilityLabel="Прикрепить">
        {uploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Paperclip size={22} color={COLORS.textSecondary} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Прикрепить</Text>
            <TouchableOpacity style={styles.row} onPress={() => handle('image')}>
              <ImageIcon size={22} color={COLORS.primary} />
              <Text style={styles.rowText}>Фото / изображение</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => handle('file')}>
              <FileText size={22} color={COLORS.primary} />
              <Text style={styles.rowText}>Файл (PDF, документ)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, styles.cancel]} onPress={() => setOpen(false)}>
              <X size={20} color={COLORS.textSecondary} />
              <Text style={[styles.rowText, { color: COLORS.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 8 },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12 },
  rowText: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  cancel: { marginTop: 6, justifyContent: 'center' },
});
