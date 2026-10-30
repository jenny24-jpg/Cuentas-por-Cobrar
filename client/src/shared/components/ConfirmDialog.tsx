import { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui-kit';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
  /** Mensaje opcional que se muestra dentro del modal si falla la operación. */
  errorMessage?: string | null;
}

/** Confirmación reutilizable para operaciones sensibles. */
export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  isLoading = false,
  errorMessage,
}: ConfirmDialogProps) => {
  // Escape cierra solo esta confirmación, no el formulario de fondo.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!isLoading) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, isLoading, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600">{description}</p>

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 max-h-56 overflow-y-auto whitespace-pre-line wrap-break-word rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"
        >
          <p className="mb-1 font-semibold">No se pudo completar la operación</p>
          {errorMessage}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={isLoading}>
          {isLoading ? 'Procesando...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
