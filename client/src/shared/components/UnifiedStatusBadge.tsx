import type { FC } from 'react';

type Tone = 'green' | 'yellow' | 'red' | 'orange' | 'gray' | 'blue';

type UnifiedStatusBadgeProps = {
  status?: string | null;
  label?: string | null;
  className?: string;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const normalize = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

const STATUS_TONES: Record<string, Tone> = {
  // Estados principales acordados para CxC
  A: 'green',
  ACTIVO: 'green',
  ACTIVA: 'green',
  PAGADO: 'green',
  PAGADA: 'green',

  PENDIENTE: 'yellow',

  VENCIDO: 'red',
  VENCIDA: 'red',

  MORA: 'orange',

  CANCELADO: 'gray',
  CANCELADA: 'gray',
  ANULADO: 'gray',
  ANULADA: 'gray',
  I: 'gray',
  INACTIVO: 'gray',
  INACTIVA: 'gray',

  PARCIAL: 'blue',
  'PARCIALMENTE APLICADO': 'blue',
  PARCIALMENTE_APLICADO: 'blue',

  // Estados operativos existentes en los demás catálogos de CxC.
  CUMPLIDO: 'green',
  CUMPLIDA: 'green',
  COMPLETADO: 'green',
  COMPLETADA: 'green',
  VISITADO: 'green',
  APROBADO: 'green',
  APROBADA: 'green',

  INCUMPLIDO: 'red',
  INCUMPLIDA: 'red',
  'NO ENCONTRADO': 'red',
  NO_ENCONTRADO: 'red',
  RECHAZADO: 'red',
  RECHAZADA: 'red',

  'EN PROCESO': 'orange',
  EN_PROCESO: 'orange',
  REPROGRAMADO: 'orange',
  REPROGRAMADA: 'orange',

  PLANIFICADA: 'blue',
  PLANIFICADO: 'blue',
  REVISION: 'blue',
  'EN REVISION': 'blue',
  'EN REVISIÓN': 'blue',
};

const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  green: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  yellow: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  red: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  orange: {
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  gray: {
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  blue: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
};

const LEGACY_ALIASES: Record<string, string> = {
  APROBADO: 'ACTIVO',
  APROBADA: 'ACTIVA',
  RECHAZADO: 'VENCIDO',
  RECHAZADA: 'VENCIDA',
  REVISION: 'PARCIAL',
  'EN REVISION': 'PARCIAL',
  'EN REVISIÓN': 'PARCIAL',
};

const DISPLAY_LABELS: Record<string, string> = {
  A: 'Activo',
  I: 'Inactivo',
  ACTIVO: 'Activo',
  ACTIVA: 'Activa',
  PAGADO: 'Pagado',
  PAGADA: 'Pagada',
  PENDIENTE: 'Pendiente',
  VENCIDO: 'Vencido',
  VENCIDA: 'Vencida',
  MORA: 'Mora',
  CANCELADO: 'Cancelado',
  CANCELADA: 'Cancelada',
  ANULADO: 'Anulado',
  ANULADA: 'Anulada',
  PARCIAL: 'Parcial',
  'PARCIALMENTE APLICADO': 'Parcialmente aplicado',
  PARCIALMENTE_APLICADO: 'Parcialmente aplicado',
  INACTIVO: 'Inactivo',
  INACTIVA: 'Inactiva',
  CUMPLIDO: 'Cumplido',
  CUMPLIDA: 'Cumplida',
  INCUMPLIDO: 'Incumplido',
  INCUMPLIDA: 'Incumplida',
  PLANIFICADA: 'Planificada',
  PLANIFICADO: 'Planificado',
  EN_PROCESO: 'En proceso',
  'EN PROCESO': 'En proceso',
  COMPLETADA: 'Completada',
  COMPLETADO: 'Completado',
  VISITADO: 'Visitado',
  NO_ENCONTRADO: 'No encontrado',
  'NO ENCONTRADO': 'No encontrado',
  REPROGRAMADO: 'Reprogramado',
  REPROGRAMADA: 'Reprogramada',
};

const formatFallbackLabel = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLocaleLowerCase('es-GT')
    .replace(/^./, (char) => char.toLocaleUpperCase('es-GT'));

export const UnifiedStatusBadge: FC<UnifiedStatusBadgeProps> = ({
  status,
  label,
  className = '',
  showDot = false,
}) => {
  const rawStatus = normalize(status);
  const rawLabel = normalize(label);
  const statusKey = LEGACY_ALIASES[rawStatus] ?? rawStatus;
  const labelKey = LEGACY_ALIASES[rawLabel] ?? rawLabel;

  const tone = STATUS_TONES[statusKey] ?? STATUS_TONES[labelKey] ?? 'gray';
  const colors = TONE_CLASSES[tone];
  const displayKey = rawLabel || statusKey;
  const displayText = DISPLAY_LABELS[displayKey] ?? formatFallbackLabel(displayKey || 'SIN ESTADO');

  return (
    <span
      className={`inline-flex h-6 min-w-[78px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold leading-none ${colors.badge} ${className}`}
      title={displayText}
    >
      {showDot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />}
      <span>{displayText}</span>
    </span>
  );
};
