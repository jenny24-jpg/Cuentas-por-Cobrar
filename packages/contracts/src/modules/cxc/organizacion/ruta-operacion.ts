import { z } from 'zod';
import { moneySchema, isoDateSchema } from '../validation';
const id = z.number().int().positive();
export const asignarDocumentoRutaSchema = z.object({
  idDocumento: id,
  /** Ignorado: el cobrador de cada parada es siempre el responsable de la ruta. Se conserva por compatibilidad. */
  idEmpleado: id.optional(),
  montoAsignado: moneySchema('Monto asignado', true),
  direccion: z.string().trim().min(1, 'La dirección es obligatoria').max(200, 'La dirección no puede superar 200 caracteres'),
  /** Ignorado: el orden lo calcula el servidor según la hora programada. */
  ordenVisita: id.optional(),
  latitud: z.number().min(-90).max(90), longitud: z.number().min(-180).max(180),
  horaProgramada: z
    .string({ error: 'La hora programada es obligatoria' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora programada debe tener formato HH:MM'),
  /** El usuario revisó en el mapa que el punto corresponde a la dirección escrita. */
  ubicacionConfirmada: z.literal(true, { error: 'Confirma que la ubicación del mapa corresponde a la dirección' }),
});
export const TIPOS_BITACORA_RUTA = ['VISITA', 'NO_ENCONTRADO', 'INCIDENCIA', 'REPROGRAMACION'] as const;
export const registrarBitacoraRutaSchema = z.object({
  idAsignacion: id, tipo: z.enum(TIPOS_BITACORA_RUTA),
  observaciones: z.string().trim().min(1).max(500),
  /** Obligatoria en REPROGRAMACION: nueva fecha acordada con el cliente. */
  nuevaFecha: isoDateSchema('La nueva fecha').optional(),
}).refine((v) => v.tipo !== 'REPROGRAMACION' || Boolean(v.nuevaFecha), {
  path: ['nuevaFecha'], message: 'Indica la nueva fecha de la visita',
});
export const cobrarRutaSchema = z.object({
  idAsignacion: id, idPago: id, idEmpleado: id,
  monto: moneySchema('Monto a aplicar', true), fecha: isoDateSchema('Fecha del cobro'),
  claveOperacion: z.string().uuid(),
});
export const perfilCobradorSchema = z.object({
  telefono: z.string().trim().max(30).refine(
    (v) => v === '' || (/^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15),
    'El teléfono solo admite números, espacios, guiones y paréntesis (entre 7 y 15 dígitos)',
  ),
  fotoUrl: z.string().max(1000).refine(v => {if (!v) return true; try {return new URL(v).protocol === 'https:';} catch {return false;}}, 'La foto debe usar una URL HTTPS'),
});
export type AsignarDocumentoRuta = z.infer<typeof asignarDocumentoRutaSchema>;
export type RegistrarBitacoraRuta = z.infer<typeof registrarBitacoraRutaSchema>;
export type PerfilCobradorInput = z.infer<typeof perfilCobradorSchema>;
export interface CobradorPerfil { ID_EMPLEADO: number; NOMBRE: string; TELEFONO: string | null; PUESTO: string | null; EMAIL: string | null; FOTO_URL: string | null }
export interface RutaAsignacion { ID_ASIGNACION: number; ID_DOCUMENTO: number; ID_CLIENTE: number; DOCUMENTO: string; CLIENTE: string; ID_EMPLEADO: number; COBRADOR: string; MONTO_ASIGNADO: number; MONTO_REGISTRADO: number; SALDO_DOCUMENTO: number; DIRECCION: string; LATITUD: number; LONGITUD: number; ID_MONEDA: number; MONEDA: string; ORDEN_VISITA: number; ESTADO_VISITA: string;
  /** Hora acordada para la visita (HH:MM). */ HORA_PROGRAMADA: string | null;
  /** Hora real en que se registró la visita (HH:MM). */ HORA_VISITA: string | null }
/** Datos de planificación de la ruta que necesita la pantalla de operación. */
export interface RutaPlanificacion { ID_RUTA: number; ID_EMPLEADO: number; RESPONSABLE: string | null; FECHA: string | null; ESTADO: string; RADIO_KM: number;
  /** Primera parada con ubicación: punto de referencia del radio. */ ANCLA: { ID_ASIGNACION: number; LATITUD: number; LONGITUD: number; CLIENTE: string } | null }
export interface RutaBitacora { ID_BITACORA: number; ID_ASIGNACION: number; TIPO: string; MONTO: number | null; OBSERVACIONES: string; REFERENCIA: string | null; FECHA: string; COBRADOR: string; DOCUMENTO: string; ESTADO: string | null; MONEDA: string | null; REGISTRADO_POR: string | null }
export interface RutaOperacion { ruta: RutaPlanificacion; asignaciones: RutaAsignacion[]; bitacora: RutaBitacora[]; cobradores: CobradorPerfil[] }
export interface RutaDocumentoPendiente { ID_DOCUMENTO: number; DOCUMENTO: string; SALDO: number; DISPONIBLE: number; CLIENTE: string; ID_MONEDA: number; MONEDA: string;
  /** Dirección registrada del cliente; se propone como dirección de la visita. */ DIRECCION_CLIENTE: string | null;
  /** Código de cobro del cliente (CR-00012). */ CODIGO_COBRO: string }
export interface RutaPagoDisponible { ID_PAGO: number; ID_CLIENTE: number; ID_MONEDA: number; REFERENCIA: string; DISPONIBLE: number; CLIENTE: string; MONEDA: string }
