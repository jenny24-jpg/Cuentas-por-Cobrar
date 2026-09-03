import { z } from 'zod';

export const pagoSchema = z.object({
  idPago: z.number().int(),
  idCliente: z.number().int(),
  idFormaPago: z.number().int(),
  idMoneda: z.number().int(),
  idBanco: z.number().int().nullable(),
  fechaPago: z.string(),
  monto: z.number(),
  numeroReferencia: z.string().nullable(),
  estado: z.string(),
});
export type Pago = z.infer<typeof pagoSchema>;

export const createPagoSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idFormaPago: z.number().int().positive('Selecciona una forma de pago'),
  idMoneda: z.number().int().positive('La moneda es obligatoria'),
  idBanco: z.number().int().positive().nullable().optional(),
  fechaPago: z.string().min(1, 'La fecha de pago es obligatoria'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  numeroReferencia: z.string().max(80, 'Máximo 80 caracteres').nullable().optional(),
  estado: z.string().min(1, 'El estado es obligatorio').max(20, 'Máximo 20 caracteres'),
});
export type CreatePagoInput = z.infer<typeof createPagoSchema>;
export const updatePagoSchema = createPagoSchema.partial();
export type UpdatePagoInput = z.infer<typeof updatePagoSchema>;
