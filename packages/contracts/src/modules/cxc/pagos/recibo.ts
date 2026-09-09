import { z } from 'zod';
export const reciboSchema = z.object({
  idRecibo: z.number().int(), idCliente: z.number().int(), idPago: z.number().int(), numeroRecibo: z.string().nullable(),
  fecha: z.string(), monto: z.number(), estado: z.string(),
});
export type Recibo = z.infer<typeof reciboSchema>;
export const createReciboSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idPago: z.number().int().positive('El pago es obligatorio'),
  numeroRecibo: z.string().max(30, 'Máximo 30 caracteres').nullable().optional(),
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  estado: z.string().min(1, 'El estado es obligatorio').max(20, 'Máximo 20 caracteres'),
});
export type CreateReciboInput = z.infer<typeof createReciboSchema>;
export const updateReciboSchema = createReciboSchema.partial();
export type UpdateReciboInput = z.infer<typeof updateReciboSchema>;
