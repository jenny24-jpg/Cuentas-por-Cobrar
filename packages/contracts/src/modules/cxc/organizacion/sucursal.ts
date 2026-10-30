import { z } from 'zod';
import { soloLetrasSchema } from '../validation';

export const ESTADOS_SUCURSAL = ['A', 'I'] as const;

export const sucursalSchema = z.object({
  idSucursal: z.number().int(),
  idEmpresa: z.number().int(),
  nombreEmpresa: z.string().nullable().optional(),
  nombre: z.string(),
  direccion: z.string().nullable(),
  /** Ubicación (grados decimales), opcional: sirve para sugerir la sucursal más cercana a una ruta. */
  latitud: z.number().nullable().optional(),
  longitud: z.number().nullable().optional(),
  estado: z.string(),
});
export type Sucursal = z.infer<typeof sucursalSchema>;

const coordenada = (min: number, max: number, etiqueta: string) =>
  z.number({ error: `${etiqueta} debe ser un número` })
    .min(min, `${etiqueta} debe estar entre ${min} y ${max}`)
    .max(max, `${etiqueta} debe estar entre ${min} y ${max}`)
    .nullable()
    .optional();

export const createSucursalSchema = z.object({
  idEmpresa: z.number().int().positive('Selecciona una empresa'),
  nombre: soloLetrasSchema('El nombre', 150),
  direccion: z.string().max(200).optional(),
  latitud: coordenada(-90, 90, 'La latitud'),
  longitud: coordenada(-180, 180, 'La longitud'),
  estado: z.enum(ESTADOS_SUCURSAL).default('A'),
});
export type CreateSucursalInput = z.infer<typeof createSucursalSchema>;

export const updateSucursalSchema = createSucursalSchema.partial();
export type UpdateSucursalInput = z.infer<typeof updateSucursalSchema>;