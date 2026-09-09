import { z } from 'zod';

// No hay CHECK constraint en Oracle para ESTADO (CHAR libre), así que
// validamos los valores permitidos aquí. Ajustar si tu equipo usa otra
// convención (ej. 'ACTIVA'/'INACTIVA' en vez de 'A'/'I').
export const ESTADOS_EMPRESA = ['A', 'I'] as const;

export const empresaSchema = z.object({
  idEmpresa: z.number().int(),
  nombre: z.string(),
  nit: z.string().nullable(),
  estado: z.string(),
});
export type Empresa = z.infer<typeof empresaSchema>;

// Input de creación: idEmpresa lo genera Oracle (IDENTITY).
export const createEmpresaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(150),
  nit: z.string().max(20).optional(),
  estado: z.enum(ESTADOS_EMPRESA).default('A'),
});
export type CreateEmpresaInput = z.infer<typeof createEmpresaSchema>;

export const updateEmpresaSchema = createEmpresaSchema.partial();
export type UpdateEmpresaInput = z.infer<typeof updateEmpresaSchema>;
