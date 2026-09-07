import { z } from 'zod';

export const ajusteSchema = z.object({
  idAjuste: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idDocumento: z.number().int().nullable(),
  tipoAjuste: z.string(),
  monto: z.number(),
  motivo: z.string().nullable(),
  fecha: z.string(),
  idEmpleado: z.number().int(),
  nombreEmpleado: z.string().nullable().optional(),
});

export type Ajuste = z.infer<typeof ajusteSchema>;

export const createAjusteSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idDocumento: z.number().int().positive().nullable().optional(),
  tipoAjuste: z.string().trim().min(1, 'El tipo de ajuste es obligatorio').max(30),
  monto: z.number().nonnegative('El monto no puede ser negativo'),
  motivo: z.string().trim().max(250).nullable().optional(),
  fecha: z.string().optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado'),
});

export type CreateAjusteInput = z.infer<typeof createAjusteSchema>;

export const updateAjusteSchema = createAjusteSchema.partial();
export type UpdateAjusteInput = z.infer<typeof updateAjusteSchema>;
