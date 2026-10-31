import { z } from 'zod';
import { nitSchema, optionalTrimmedText, soloLetrasSchema } from '../validation';

export const ESTADOS_EMPRESA = ['A', 'I'] as const;

export const empresaSchema = z.object({
  idEmpresa: z.number().int(),
  nombre: z.string(),
  nit: z.string().nullable(),
  direccion: z.string().nullable(),
  giroComercial: z.string().nullable(),
  estado: z.string(),
});
export type Empresa = z.infer<typeof empresaSchema>;

export const createEmpresaSchema = z.object({
  nombre: soloLetrasSchema('El nombre', 150),
  nit: nitSchema.nullable().optional(),
  direccion: optionalTrimmedText('La dirección', 250),
  // Las opciones salen de la base (tipos ya registrados en CXC_EMPRESAS.GIRO_COMERCIAL);
  // el servicio valida que el valor exista. Un tipo nuevo lo carga el equipo DBA.
  giroComercial: z.string({ error: 'Selecciona un tipo de comercio de la lista' }).trim()
    .min(1, 'Selecciona un tipo de comercio de la lista').max(200, 'El tipo de comercio no puede superar 200 caracteres'),
  estado: z.enum(ESTADOS_EMPRESA).default('A'),
});
export type CreateEmpresaInput = z.infer<typeof createEmpresaSchema>;

export const updateEmpresaSchema = createEmpresaSchema.partial();
export type UpdateEmpresaInput = z.infer<typeof updateEmpresaSchema>;
