import React from 'react';
import { AlertTriangle, Clock, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';

/**
 * Status Badge Component with pastel colors and semi-bold text
 */
export const StatusBadge = ({
  status = 'pendiente',
  label,
  showDot = false,
  className = '',
  size = 'md'
}) => {
  const normalizedStatus = String(status).toLowerCase().trim();

  let config = {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
    icon: AlertCircle,
    defaultLabel: status
  };

  if (normalizedStatus.includes('aprob')) {
    config = {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
      defaultLabel: status === 'aprobada' ? 'Aprobada' : 'Aprobado'
    };
  } else if (normalizedStatus.includes('pend')) {
    config = {
      bg: 'bg-amber-50 text-amber-700 border-amber-200/80',
      dot: 'bg-amber-500',
      icon: Clock,
      defaultLabel: 'Pendiente'
    };
  } else if (normalizedStatus.includes('rechaz')) {
    config = {
      bg: 'bg-red-50 text-red-700 border-red-200/80',
      dot: 'bg-red-500',
      icon: XCircle,
      defaultLabel: status === 'rechazada' ? 'Rechazada' : 'Rechazado'
    };
  } else if (normalizedStatus.includes('revisi') || normalizedStatus.includes('rev')) {
    config = {
      bg: 'bg-blue-50 text-blue-700 border-blue-200/80',
      dot: 'bg-blue-500',
      icon: AlertCircle,
      defaultLabel: 'En Revisión'
    };
  }

  const displayText = label || config.defaultLabel;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1 text-sm'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${config.bg} ${sizeClasses[size]} ${className}`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot} shrink-0`} />
      )}
      <span>{displayText}</span>
    </span>
  );
};

/**
 * Audit Banner Component
 * Container with soft amber border, warning icon, author and modification date text.
 */
export const AuditBanner = ({
  author = 'Eduardo Ruiz',
  date = '25 Oct 2026, 14:30',
  action = 'Última modificación realizada por',
  icon: CustomIcon,
  className = '',
  children
}) => {
  const IconComponent = CustomIcon || AlertTriangle;

  return (
    <div
      className={`w-full bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 flex items-center justify-between gap-3 text-sm text-amber-900 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100/80 rounded-lg text-amber-700 shrink-0">
          <IconComponent size={18} />
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs sm:text-sm">
          <span className="font-normal text-amber-800/90">{action}</span>
          <span className="font-semibold text-amber-950">{author}</span>
          <span className="text-amber-700/60">•</span>
          <span className="font-medium text-amber-800/80">{date}</span>
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
};
