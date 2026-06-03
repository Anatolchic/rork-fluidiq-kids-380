import { Check, CheckCheck, Clock } from 'lucide-react-native';
import { COLORS } from '../lib/constants';

type Props = {
  pending?: boolean;
  read?: boolean;
  light?: boolean;
};

/** WhatsApp-style: ⏱ pending → ✓ delivered → ✓✓ read (синий) */
export function MessageStatus({ pending, read, light }: Props) {
  const baseColor = light ? '#FFFFFFB3' : COLORS.textSecondary;
  const readColor = light ? '#7FE0FF' : COLORS.primary;
  if (pending) return <Clock size={13} color={baseColor} />;
  if (read) return <CheckCheck size={15} color={readColor} strokeWidth={2.5} />;
  return <Check size={15} color={baseColor} strokeWidth={2} />;
}
