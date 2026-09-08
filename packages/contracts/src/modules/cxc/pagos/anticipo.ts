import { z } from 'zod';
export const anticipoSchema = z.object({
  idAnticipo: z.number().int(), idCliente: z.number().int(), idPago: z.number().int().nullable(),
  montoOriginal: z.number(), montoDisponible: z.number(), fecha: z.string(), estado: z.string(),
});
export type Anticipo = z.infer<typeof anticipoSchema>;
export const createAnticipoSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idPago: z.number().int().positive().nullable().optional(),
  montoOriginal: z.number().positive('El monto original debe ser mayor a 0'),
  montoDisponible: z.number().min(0, 'El monto disponible no puede ser negativo'),
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  estado: z.string().min(1, 'El estado es obligatorio').max(20, 'Máximo 20 caracteres'),
});
export type CreateAnticipoInput = z.infer<typeof createAnticipoSchema>;
export const updateAnticipoSchema = createAnticipoSchema.partial();
export type UpdateAnticipoInput = z.infer<typeof updateAnticipoSchema>;
