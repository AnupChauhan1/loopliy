import { Bell, CheckCircle2, RotateCcw, Send, UserPlus, UserMinus, CalendarOff, Megaphone, Palette, Clapperboard, XCircle } from 'lucide-react';

export interface NotificationMeta {
  icon: React.ElementType;
  tile: string;
  ring: string;
}

/** Visual treatment per notification type (types come from the API, e.g. `task_assigned`). */
export function notificationMeta(type: string = ''): NotificationMeta {
  const t = type.toLowerCase();
  if (t.includes('reject')) return { icon: XCircle, tile: 'from-rose-400 to-brand-600', ring: 'ring-rose-200' };
  if (t.includes('complet') || t.includes('approv') || t.includes('deliver')) return { icon: CheckCircle2, tile: 'from-brand-400 to-brand-600', ring: 'ring-brand-200' };
  if (t.includes('change')) return { icon: RotateCcw, tile: 'from-gray-400 to-gray-500', ring: 'ring-gray-200' };
  if (t.includes('submit') || t.includes('review')) return { icon: Send, tile: 'from-brand-400 to-brand-600', ring: 'ring-brand-200' };
  if (t.includes('unassign')) return { icon: UserMinus, tile: 'from-gray-400 to-gray-600', ring: 'ring-gray-200' };
  if (t.startsWith('creative')) return { icon: Palette, tile: 'from-brand-400 to-brand-600', ring: 'ring-brand-200' };
  if (t.startsWith('video')) return { icon: Clapperboard, tile: 'from-brand-400 to-brand-600', ring: 'ring-brand-200' };
  if (t.includes('assign')) return { icon: UserPlus, tile: 'from-brand-400 to-brand-600', ring: 'ring-brand-200' };
  if (t.includes('leave')) return { icon: CalendarOff, tile: 'from-gray-400 to-gray-500', ring: 'ring-gray-200' };
  if (t.includes('announce')) return { icon: Megaphone, tile: 'from-brand-400 to-brand-600', ring: 'ring-brand-200' };
  return { icon: Bell, tile: 'from-brand-400 to-brand-500', ring: 'ring-brand-200' };
}
