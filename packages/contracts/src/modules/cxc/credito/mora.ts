import { z } from 'zod';
import {
  nullableIsoDateSchema,
  optionalMoneySchema,
  percentageSchema,
} from '../validation';

export const ESTADOS_MORA = ['ACTIVA', 'PAGADA', 'ANULADA'] as const;

export const moraSchema = z.object({
  idMora: z.number().int(),
  idDocumento: z.number().int(),
  diasMora: z.number().int().nullable(),
  saldoVencido: z.number().nullable(),
  porcentajeMora: z.number().nullable(),
  montoMora: z.number().nullable(),
  fechaCalculo: z.string().nullable(),
  estado: z.enum(ESTADOS_MORA),
});

export type Mora = z.infer<typeof moraSchema>;

const nullablePercentageSchema = percentageSchema('El porcentaje de mora', 4, true).nullable().optional();

export const createMoraSchema = z.object({
  idDocumento: z.number().int().positive('El documento es obligatorio'),
  diasMora: z.number().int().positive('Los días de mora deben ser mayores a 0').max(36500, 'Los días de mora exceden el rango permitido').nullable().optional(),
  saldoVencido: optionalMoneySchema('El saldo vencido', true),
  porcentajeMora: nullablePercentageSchema,
  montoMora: optionalMoneySchema('El monto de mora', true),
  fechaCalculo: nullableIsoDateSchema('La fecha de cálculo'),
  estado: z.enum(ESTADOS_MORA).default('ACTIVA'),
});

export type CreateMoraInput = z.infer<typeof createMoraSchema>;
export const updateMoraSchema = createMoraSchema.partial();
export type UpdateMoraInput = z.infer<typeof updateMoraSchema>;

/**
 * Cartera en mora calculada en vivo (no se registra a mano): cada documento de cargo con
 * saldo pendiente, con la condición de crédito del documento o, si no tiene, la del cliente.
 *
 *   inicio de mora = fecha de vencimiento + días de gracia
 *   días de mora   = hoy - inicio de mora
 *   % de mora      = % del tramo (CXC_TRAMOS_MORA) - reducción del segmento del cliente
 *   monto de mora  = saldo * % mora / 100   (misma regla que el recálculo guardado)
 *
 * La mora se cobra con notas de débito (tipo con ES_MORA = 'S'); cuando sube de
 * tramo se emite otra nota solo por la diferencia.
 */
export const ESTADOS_CARTERA_MORA = ['EN_MORA', 'EN_GRACIA', 'EN_CONVENIO', 'POR_VENCER', 'AL_DIA'] as const;
export type EstadoCarteraMora = (typeof ESTADOS_CARTERA_MORA)[number];

/** Ventana de "próximos a vencer", en días. */
export const DIAS_PROXIMOS_A_VENCER = 15;

export interface CarteraMoraDocumento {
  idDocumento: number;
  idCliente: number;
  codigoCliente: string;
  cliente: string;
  documento: string;
  moneda: string;
  fechaDocumento: string;
  fechaVencimiento: string;
  fechaInicioMora: string;
  diasGracia: number;
  /** Positivo: días desde el vencimiento. Negativo: días que faltan para vencer. */
  diasVencido: number;
  diasMora: number;
  saldo: number;
  /** Segmento del cliente (A, B, C, D) o null si no tiene. */
  segmento: string | null;
  /** % del tramo según los días de mora. */
  porcentajeTramo: number;
  /** Puntos que el segmento resta al tramo. */
  reduccionMora: number;
  /** % aplicado: tramo - reducción (nunca menor que 0). */
  porcentajeMora: number;
  /** Recargo total calculado a hoy. */
  montoMora: number;
  /** Ya cobrado en notas de débito por mora. */
  montoEmitido: number;
  /** Falta cobrar: se emite en la próxima nota de débito. */
  montoPorEmitir: number;
  estado: EstadoCarteraMora;
}

/** Mora de un cliente para el aviso al registrar un pago. */
export interface ResumenMoraCliente {
  idCliente: number;
  documentosEnMora: number;
  /** Mayor atraso (días de mora) entre sus documentos. */
  diasMaxMora: number;
  /** Notas de débito por mora con saldo pendiente. */
  notasPendientes: number;
  /** Lo que debe en notas de débito por mora. */
  moraPendiente: number;
  /** Recargo calculado que todavía no se ha emitido como nota. */
  moraPorEmitir: number;
}
