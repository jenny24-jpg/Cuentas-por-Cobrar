import { z } from 'zod';
import { isoDateSchema } from '../validation';

export const ESTADOS_RECIBO = ['EMITIDO', 'CANCELADO'] as const;

export const reciboSchema = z.object({
  idRecibo: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idPago: z.number().int(),
  referenciaPago: z.string().nullable().optional(),
  numeroRecibo: z.string().nullable(),
  fecha: z.string(),
  monto: z.number(),
  estado: z.enum(ESTADOS_RECIBO),
});
export type Recibo = z.infer<typeof reciboSchema>;

export const createReciboSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idPago: z.number().int().positive('El pago es obligatorio'),
  // Sin numeroRecibo ni monto: el sistema asigna el número (REC-AAAA-000001) y el
  // monto es lo que al pago le falta respaldar con recibo. Ninguno se edita.
  fecha: isoDateSchema('La fecha'),
  estado: z.enum(ESTADOS_RECIBO).default('EMITIDO'),
});
export type CreateReciboInput = z.infer<typeof createReciboSchema>;

export const updateReciboSchema = createReciboSchema.partial();
export type UpdateReciboInput = z.infer<typeof updateReciboSchema>;
