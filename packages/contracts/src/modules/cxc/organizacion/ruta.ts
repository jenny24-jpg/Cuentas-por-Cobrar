import { z } from 'zod';
import { identifierSchema, soloLetrasSchema, isoDateSchema, optionalTrimmedText } from '../validation';
import { REGLAS_RUTA } from './ruta-reglas';

export const ESTADOS_RUTA = ['PLANIFICADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'] as const;

export const rutaSchema = z.object({
  idRuta: z.number().int(),
  codigoRuta: z.string().nullable(),
  nombre: z.string(),
  idEmpleado: z.number().int(),
  nombreEmpleado: z.string().nullable().optional(),
  fecha: z.string().nullable(),
  estado: z.string(),
  observaciones: z.string(),
  /** Radio máximo (km) de las paradas respecto a la primera parada. */
  radioKm: z.number(),
});
export type Ruta = z.infer<typeof rutaSchema>;

const radioKmSchema = z
  .number({ error: 'El radio debe ser un número' })
  .min(REGLAS_RUTA.radioKmMinimo, `El radio debe ser de al menos ${REGLAS_RUTA.radioKmMinimo} km`)
  .max(REGLAS_RUTA.radioKmMaximo, `El radio no puede superar ${REGLAS_RUTA.radioKmMaximo} km`);

export const createRutaSchema = z.object({
  codigoRuta: identifierSchema('El código de ruta', 20).optional(),
  nombre: soloLetrasSchema('El nombre', 120),
  idEmpleado: z.number().int().positive('Selecciona un empleado responsable'),
  /** Fecha planificada: obligatoria; el servicio exige que no sea pasada y que sea de lunes a viernes. */
  fecha: isoDateSchema('La fecha planificada'),
  estado: z.enum(ESTADOS_RUTA).default('PLANIFICADA'),
  observaciones: optionalTrimmedText('Las observaciones', 500),
  radioKm: radioKmSchema.default(REGLAS_RUTA.radioKmDefecto),
});
export type CreateRutaInput = z.infer<typeof createRutaSchema>;

/** Resumen de rutas agrupadas por empleado (pantalla de Rutas, primer nivel). */
export interface RutasPorEmpleado {
  idEmpleado: number;
  nombreEmpleado: string | null;
  totalRutas: number;
  planificadas: number;
  enProceso: number;
  completadas: number;
  canceladas: number;
  /** Fecha planificada más próxima entre sus rutas PLANIFICADA/EN_PROCESO (ISO), o null. */
  proximaFecha: string | null;
  /** Fecha planificada más reciente de cualquiera de sus rutas (ISO), o null. */
  ultimaFecha: string | null;
}

export const updateRutaSchema = z.object({
  codigoRuta: identifierSchema('El código de ruta', 30).optional(),
  nombre: soloLetrasSchema('El nombre', 120).optional(),
  idEmpleado: z.number().int().positive('Selecciona un empleado responsable').optional(),
  fecha: isoDateSchema('La fecha planificada').optional(),
  estado: z.enum(ESTADOS_RUTA).optional(),
  observaciones: optionalTrimmedText('Las observaciones', 500),
  radioKm: radioKmSchema.optional(),
});
export type UpdateRutaInput = z.infer<typeof updateRutaSchema>;