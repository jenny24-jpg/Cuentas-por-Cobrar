import { z } from 'zod';
export const aplicacionPagoSchema = z.object({
  idAplicacion: z.number().int(), idPago: z.number().int(), idDocumento: z.number().int(),
  fechaAplicacion: z.string(), montoAplicado: z.number(), idEmpleado: z.number().int().nullable(),
});
export type AplicacionPago = z.infer<typeof aplicacionPagoSchema>;
export const createAplicacionPagoSchema = z.object({
  idPago: z.number().int().positive('El pago es obligatorio'),
  idDocumento: z.number().int().positive('El documento es obligatorio'),
  fechaAplicacion: z.string().min(1, 'La fecha de aplicación es obligatoria'),
  montoAplicado: z.number().positive('El monto aplicado debe ser mayor a 0'),
  idEmpleado: z.number().int().positive().nullable().optional(),
});
export type CreateAplicacionPagoInput = z.infer<typeof createAplicacionPagoSchema>;
export const updateAplicacionPagoSchema = createAplicacionPagoSchema.partial();
export type UpdateAplicacionPagoInput = z.infer<typeof updateAplicacionPagoSchema>;
