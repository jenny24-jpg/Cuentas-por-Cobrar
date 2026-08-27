import { z } from 'zod';

export const ESTADOS_CONVENIO_PAGO = ['ACTIVO', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO'] as const;

export const convenioPagoSchema = z.object({
  idConvenio: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  fechaConvenio: z.string(),
  montoDeuda: z.number(),
  numeroCuotas: z.number().int(),
  estado: z.enum(ESTADOS_CONVENIO_PAGO),
  observaciones: z.string().nullable(),
});

export type ConvenioPago = z.infer<typeof convenioPagoSchema>;

export const createConvenioPagoSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  fechaConvenio: z.string().min(1, 'La fecha del convenio es obligatoria'),
  montoDeuda: z.number().positive('El monto de la deuda debe ser mayor a 0'),
  numeroCuotas: z.number().int().min(1, 'Debe tener al menos 1 cuota').max(60),
  estado: z.enum(ESTADOS_CONVENIO_PAGO).default('ACTIVO'),
  observaciones: z.string().max(500).optional(),
});

export type CreateConvenioPagoInput = z.infer<typeof createConvenioPagoSchema>;

export const updateConvenioPagoSchema = createConvenioPagoSchema.partial();
export type UpdateConvenioPagoInput = z.infer<typeof updateConvenioPagoSchema>;
