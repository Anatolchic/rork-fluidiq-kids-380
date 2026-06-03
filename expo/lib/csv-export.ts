import { Platform } from 'react-native';

type Row = Record<string, any>;

function escape(v: any): string {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

export function toCSV(rows: Row[], columns?: { key: string; label?: string }[]): string {
  if (!rows.length) return '';
  const cols = columns || Object.keys(rows[0]).map(k => ({ key: k }));
  const head = cols.map(c => escape(c.label || c.key)).join(';');
  const body = rows.map(r => cols.map(c => escape(r[c.key])).join(';')).join('\n');
  return '﻿' + head + '\n' + body; // BOM для Excel
}

export async function downloadCSV(
  filename: string,
  rows: Row[],
  columns?: { key: string; label?: string }[],
) {
  const csv = toCSV(rows, columns);
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } else {
    const FileSystem = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const path = (FileSystem.documentDirectory || '') + filename;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
  }
}
