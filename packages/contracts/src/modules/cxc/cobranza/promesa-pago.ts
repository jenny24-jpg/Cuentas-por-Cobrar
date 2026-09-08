import { z } from 'zod';

export const ESTADOS_PROMESA_PAGO = ['PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA'] as const;

export const promesaPagoSchema = z.object({
  idPromesa: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idDocumento: z.number().int().nullable(),
  idGestion: z.number().int().nullable(),
  fechaPromesa: z.string(),
  fechaCompromiso: z.string().nullable(),
  montoComprometido: z.number(),
  estado: z.enum(ESTADOS_PROMESA_PAGO),
  observaciones: z.string().nullable(),
});

export type PromesaPago = z.infer<typeof promesaPagoSchema>;

export const createPromesaPagoSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idDocumento: z.number().int().positive().nullable().optional(),
  idGestion: z.number().int().positive().nullable().optional(),
  fechaPromesa: z.string().min(1, 'La fecha de promesa es obligatoria'),
  fechaCompromiso: z.string().optional(),
  montoComprometido: z.number().positive('El monto comprometido debe ser mayor a 0'),
  estado: z.enum(ESTADOS_PROMESA_PAGO).default('PENDIENTE'),
  observaciones: z.string().max(500).optional(),
});

export type CreatePromesaPagoInput = z.infer<typeof createPromesaPagoSchema>;

export const updatePromesaPagoSchema = createPromesaPagoSchema.partial();
export type UpdatePromesaPagoInput = z.infer<typeof updatePromesaPagoSchema>;
