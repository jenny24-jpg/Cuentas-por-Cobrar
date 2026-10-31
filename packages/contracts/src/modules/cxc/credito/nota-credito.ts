import { z } from 'zod';
import { isoDateSchema, moneySchema } from '../validation';

export const ESTADOS_NOTA_CREDITO = [
  'PENDIENTE',
  'APLICADA',
  'ANULADA',
] as const;

export const notaCreditoSchema = z.object({
  idNotaCredito: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idDocumentoReferencia: z.number().int().nullable(),
  descripcion: z.string().nullable(),
  serie: z.string().nullable(),
  numero: z.string().nullable(),
  fecha: z.string(),
  monto: z.number(),
  montoAplicado: z.number().optional(),
  montoDisponible: z.number().optional(),
  // string para tolerar ACTIVA en datos heredados mientras se normaliza BD.
  estado: z.string(),
  idEmpleadoAnulacion: z.number().int().nullable(),
  nombreEmpleadoAnulacion: z.string().nullable().optional(),
  fechaAnulacion: z.string().nullable(),
  motivoAnulacion: z.string().nullable(),
  // Aprobación: la registra un usuario y la aprueba un ADMIN distinto. Una nota
  // PENDIENTE sin aprobador está "por aprobar" y todavía no toca ningún saldo.
  idEmpleadoRegistro: z.number().int().nullable().optional(),
  nombreEmpleadoRegistro: z.string().nullable().optional(),
  fechaRegistro: z.string().nullable().optional(),
  idEmpleadoAprobacion: z.number().int().nullable().optional(),
  nombreEmpleadoAprobacion: z.string().nullable().optional(),
  fechaAprobacion: z.string().nullable().optional(),
});

export type NotaCredito = z.infer<typeof notaCreditoSchema>;

/** Rechazo de una nota por aprobar: queda ANULADA con el motivo. */
export const rechazarNotaCreditoSchema = z.object({
  motivoRechazo: z.string().trim().min(10, 'Describe el motivo del rechazo (mínimo 10 caracteres)').max(250, 'El motivo no puede superar 250 caracteres'),
});
export type RechazarNotaCreditoInput = z.infer<typeof rechazarNotaCreditoSchema>;

/**
 * Serie y número los asigna el sistema (serie = código del tipo de documento CREDITO,
 * número = correlativo): no forman parte de la entrada.
 * Documento de referencia y descripción son obligatorios: una nota de crédito siempre
 * rebaja un documento concreto y debe explicar por qué.
 */
const notaCreditoBaseSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idDocumentoReferencia: z.number({ error: 'Selecciona el documento al que aplica la nota' }).int().positive('Selecciona el documento al que aplica la nota'),
  descripcion: z.string().trim().min(10, 'Describe el motivo de la nota (mínimo 10 caracteres)').max(250, 'La descripción no puede superar 250 caracteres'),
  fecha: isoDateSchema('La fecha'),
  monto: moneySchema('El monto', true),
});

export const createNotaCreditoSchema = notaCreditoBaseSchema.extend({
  estado: z.literal('PENDIENTE').default('PENDIENTE'),
});

export type CreateNotaCreditoInput = z.infer<typeof createNotaCreditoSchema>;

/** El estado se deriva de las aplicaciones; no se edita desde el CRUD. */
export const updateNotaCreditoSchema = notaCreditoBaseSchema.partial();
export type UpdateNotaCreditoInput = z.infer<typeof updateNotaCreditoSchema>;

export const anularNotaCreditoSchema = z.object({
  idEmpleadoAnulacion: z.number().int().positive('Selecciona el empleado que anula'),
  motivoAnulacion: z.string().trim().min(10, 'Describe el motivo de la anulación (mínimo 10 caracteres)').max(250, 'El motivo no puede superar 250 caracteres'),
  fechaAnulacion: isoDateSchema('La fecha de anulación').optional(),
});
export type AnularNotaCreditoInput = z.infer<typeof anularNotaCreditoSchema>;
