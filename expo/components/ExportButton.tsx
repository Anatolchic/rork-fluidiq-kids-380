import { TouchableOpacity, Text } from 'react-native';
import { Download } from 'lucide-react-native';
import { COLORS } from '../lib/constants';
import { downloadCSV } from '../lib/csv-export';

export function ExportButton({
  filename,
  rows,
  columns,
  label = 'Скачать CSV',
}: {
  filename: string;
  rows: any[];
  columns?: { key: string; label?: string }[];
  label?: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => downloadCSV(filename, rows, columns)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: COLORS.primary + '15',
        borderRadius: 10,
        alignSelf: 'flex-start',
      }}
    >
      <Download size={16} color={COLORS.primary} />
      <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}
