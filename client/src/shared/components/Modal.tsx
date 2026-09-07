import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Ancho máximo del modal. 'md' cubre la mayoría de formularios CRUD. */
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

/**
 * Modal genérico para toda la app (crear/editar registros, confirmar
 * acciones puntuales). No existía en el kit de components/ui — vive aquí en
 * shared/ porque es transversal a todos los módulos (compras, bancos, cxp,
 * cxc), no propiedad de uno solo.
 *
 * Uso:
 * <Modal isOpen={open} onClose={() => setOpen(false)} title="Nueva gestión de cobro">
 *   <FormularioGestionCobro onSuccess={() => setOpen(false)} />
 * </Modal>
 */
export const Modal = ({ isOpen, onClose, title, description, children, size = 'md' }: ModalProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full ${sizeStyles[size]} bg-white rounded-xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="modal-title" className="text-base font-bold text-slate-900">
              {title}
            </h2>
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
