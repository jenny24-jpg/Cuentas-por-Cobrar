import { z } from 'zod';

/**
 * Reversas y anulaciones con autorización. Ninguna se ejecuta al pedirla: queda
 * PENDIENTE hasta que un ADMIN distinto de quien la solicitó la aprueba (se ejecuta)
 * o la rechaza (no cambia nada). Un OPERADOR solicita y aprueba un ADMIN; si solicita
 * un ADMIN, aprueba otro ADMIN.
 */
export const TIPOS_SOLICITUD_REVERSA = [
  'REVERSA_APLICACION_PAGO',
  'REVERSA_APLICACION_ANTICIPO',
  'REVERSA_APLICACION_NC',
  'ANULACION_PAGO',
  'ANULACION_ANTICIPO',
  'ANULACION_NOTA_CREDITO',
  'ANULACION_DOCUMENTO',
  'ANULACION_FACTURA_FEL',
] as const;
export type TipoSolicitudReversa = (typeof TIPOS_SOLICITUD_REVERSA)[number];

export const TIPO_SOLICITUD_LABEL: Record<TipoSolicitudReversa, string> = {
  REVERSA_APLICACION_PAGO: 'Reversa de aplicación de pago',
  REVERSA_APLICACION_ANTICIPO: 'Reversa de aplicación de anticipo',
  REVERSA_APLICACION_NC: 'Reversa de aplicación de nota de crédito',
  ANULACION_PAGO: 'Anulación de pago',
  ANULACION_ANTICIPO: 'Anulación de anticipo',
  ANULACION_NOTA_CREDITO: 'Anulación de nota de crédito',
  ANULACION_DOCUMENTO: 'Anulación de documento',
  ANULACION_FACTURA_FEL: 'Anulación de factura FEL',
};

export const ESTADOS_SOLICITUD_REVERSA = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA'] as const;
export type EstadoSolicitudReversa = (typeof ESTADOS_SOLICITUD_REVERSA)[number];

const motivo = (campo: string) =>
  z.string({ error: `Describe el motivo ${campo}` }).trim()
    .min(10, `Describe el motivo ${campo} (mínimo 10 caracteres)`)
    .max(250, 'El motivo no puede superar 250 caracteres');

export const crearSolicitudReversaSchema = z.object({
  tipo: z.enum(TIPOS_SOLICITUD_REVERSA, { error: 'Tipo de solicitud no válido' }),
  idRegistro: z.number().int().positive('Registro no válido'),
  motivo: motivo('de la solicitud'),
});
export type CrearSolicitudReversaInput = z.infer<typeof crearSolicitudReversaSchema>;

export const rechazarSolicitudReversaSchema = z.object({
  motivoRechazo: motivo('del rechazo'),
});
export type RechazarSolicitudReversaInput = z.infer<typeof rechazarSolicitudReversaSchema>;

export interface SolicitudReversa {
  idSolicitud: number;
  tipo: TipoSolicitudReversa;
  idRegistro: number;
  referencia: string | null;
  monto: number | null;
  motivo: string;
  estado: EstadoSolicitudReversa;
  idUsuarioSolicita: number;
  solicitante: string | null;
  rolSolicitante: string | null;
  fechaSolicitud: string;
  idUsuarioResuelve: number | null;
  resolvio: string | null;
  fechaResolucion: string | null;
  motivoRechazo: string | null;
}
