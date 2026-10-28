import { z } from 'zod';
import { nitSchema, optionalTrimmedText, soloLetrasSchema } from '../validation';

export const ESTADOS_EMPRESA = ['A', 'I'] as const;

/** Catálogo cerrado de tipos de comercio; se guarda el texto en CXC_EMPRESAS.GIRO_COMERCIAL. */
export const TIPOS_COMERCIO = [
  'Abarrotes',
  'Ferretería',
  'Librería',
  'Farmacia / Medicina',
  'Supermercado',
  'Restaurante / Comida',
  'Ropa y calzado',
  'Electrónica',
  'Materiales de construcción',
  'Agropecuaria',
  'Servicios',
  'Otro',
] as const;

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
  giroComercial: z.enum(TIPOS_COMERCIO, { error: 'Selecciona un tipo de comercio de la lista' }),
  estado: z.enum(ESTADOS_EMPRESA).default('A'),
});
export type CreateEmpresaInput = z.infer<typeof createEmpresaSchema>;

export const updateEmpresaSchema = createEmpresaSchema.partial();
export type UpdateEmpresaInput = z.infer<typeof updateEmpresaSchema>;
