import { z } from 'zod';
import { isoDateSchema, moneySchema } from '../validation';

export const aplicacionPagoSchema = z.object({
  idAplicacion: z.number().int(),
  idPago: z.number().int(),
  referenciaPago: z.string().nullable().optional(),
  idDocumento: z.number().int(),
  referenciaDocumento: z.string().nullable().optional(),
  fechaAplicacion: z.string(),
  montoAplicado: z.number(),
  idEmpleado: z.number().int().nullable(),
  nombreEmpleado: z.string().nullable().optional(),
});
export type AplicacionPago = z.infer<typeof aplicacionPagoSchema>;

export const createAplicacionPagoSchema = z.object({
  idPago: z.number().int().positive('El pago es obligatorio'),
  idDocumento: z.number().int().positive('El documento es obligatorio'),
  fechaAplicacion: isoDateSchema('La fecha de aplicación'),
  montoAplicado: moneySchema('El monto aplicado', true),
  idEmpleado: z.number().int().positive('El empleado debe ser válido').nullable().optional(),
});
export type CreateAplicacionPagoInput = z.infer<typeof createAplicacionPagoSchema>;

export const updateAplicacionPagoSchema = createAplicacionPagoSchema.partial();
export type UpdateAplicacionPagoInput = z.infer<typeof updateAplicacionPagoSchema>;
