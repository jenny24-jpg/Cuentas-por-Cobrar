import { z } from 'zod';
import { isoDateSchema } from '../validation';

export const ESTADOS_ANTICIPO = ['DISPONIBLE', 'APLICADO', 'AGOTADO', 'CANCELADO'] as const;

export const anticipoSchema = z.object({
  idAnticipo: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idPago: z.number().int().nullable(),
  referenciaPago: z.string().nullable().optional(),
  montoOriginal: z.number(),
  montoDisponible: z.number(),
  fecha: z.string(),
  estado: z.enum(ESTADOS_ANTICIPO),
  idEmpleadoAnulacion: z.number().int().nullable(),
  nombreEmpleadoAnulacion: z.string().nullable().optional(),
  fechaAnulacion: z.string().nullable(),
  motivoAnulacion: z.string().nullable(),
});
export type Anticipo = z.infer<typeof anticipoSchema>;

/**
 * Un anticipo es dinero que el cliente ya entregó: siempre nace de un pago registrado
 * (el "pago relacionado") y su monto original es el monto de ese pago. Por eso el
 * monto no se escribe: lo pone el sistema, y el disponible inicia igual al original.
 */
const anticipoBaseSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idPago: z.number({ error: 'Selecciona el pago que respalda el anticipo' }).int().positive('Selecciona el pago que respalda el anticipo'),
  fecha: isoDateSchema('La fecha'),
});

export const createAnticipoSchema = anticipoBaseSchema;
export type CreateAnticipoInput = z.infer<typeof createAnticipoSchema>;

// ESTADO ya no se edita libremente vía update(): nace DISPONIBLE y solo el
// motor financiero (aplicar/reversar) o anular() lo cambian después.
export const updateAnticipoSchema = anticipoBaseSchema.partial();
export type UpdateAnticipoInput = z.infer<typeof updateAnticipoSchema>;

export const anularAnticipoSchema = z.object({
  idEmpleadoAnulacion: z.number().int().positive('Selecciona el empleado que anula'),
  motivoAnulacion: z.string().trim().min(10, 'Describe el motivo de la anulación (mínimo 10 caracteres)').max(250, 'El motivo no puede superar 250 caracteres'),
  fechaAnulacion: isoDateSchema('La fecha de anulación').optional(),
});
export type AnularAnticipoInput = z.infer<typeof anularAnticipoSchema>;
