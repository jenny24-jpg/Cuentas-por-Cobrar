
import { z } from 'zod';
import { moneySchema, isoDateSchema } from '../validation';

// =====================================================
// IDENTIFICADORES
// =====================================================

const id = z.number().int().positive();

// =====================================================
// ASIGNAR DOCUMENTO A UNA RUTA
// =====================================================

export const asignarDocumentoRutaSchema = z.object({
  idDocumento: id,

  /**
   * Ignorado:
   * El cobrador de cada parada es siempre
   * el responsable de la ruta.
   *
   * Se conserva por compatibilidad.
   */
  idEmpleado: id.optional(),

  montoAsignado: moneySchema(
    'Monto asignado',
    true,
  ),

  direccion: z
    .string()
    .trim()
    .min(1, 'La dirección es obligatoria')
    .max(
      200,
      'La dirección no puede superar 200 caracteres',
    ),

  /**
   * Ignorado:
   * El orden lo calcula el servidor según
   * la hora programada.
   */
  ordenVisita: id.optional(),

  latitud: z.number().min(-90).max(90),

  longitud: z.number().min(-180).max(180),

  horaProgramada: z
    .string({
      error: 'La hora programada es obligatoria',
    })
    .regex(
      /^([01]\d|2[0-3]):[0-5]\d$/,
      'La hora programada debe tener formato HH:MM',
    ),

  /**
   * El usuario debe confirmar que el punto
   * seleccionado en el mapa corresponde
   * a la dirección registrada.
   */
  ubicacionConfirmada: z.literal(true, {
    error:
      'Confirma que la ubicación del mapa corresponde a la dirección',
  }),
});

// =====================================================
// TIPOS DE ACTIVIDADES DE COBRANZA
// =====================================================

/**
 * VISITA:
 * El cobrador realizó la visita.
 *
 * NO_ENCONTRADO:
 * El cliente no fue localizado.
 *
 * PAGO_DENEGADO:
 * El cliente fue contactado, pero rechazó
 * realizar el pago.
 *
 * INCIDENCIA:
 * Se registra una observación adicional.
 * Por sí sola no cambia el estado de visita.
 *
 * REPROGRAMACION:
 * Se acuerda una nueva fecha de visita.
 *
 * IMPORTANTE:
 * PAGO_DENEGADO es un resultado de gestión,
 * no un pago financiero.
 *
 * No debe generar recibos ni movimientos
 * en CXC_APLICACION_PAGOS.
 */
export const TIPOS_BITACORA_RUTA = [
  'VISITA',
  'NO_ENCONTRADO',
  'PAGO_DENEGADO',
  'INCIDENCIA',
  'REPROGRAMACION',
] as const;

export type TipoBitacoraRuta =
  (typeof TIPOS_BITACORA_RUTA)[number];

// =====================================================
// REGISTRAR ACTIVIDAD EN BITÁCORA
// =====================================================

export const registrarBitacoraRutaSchema = z
  .object({
    idAsignacion: id,

    tipo: z.enum(TIPOS_BITACORA_RUTA),

    /**
     * Las observaciones son obligatorias
     * para todas las actividades.
     *
     * En PAGO_DENEGADO deben describir
     * el motivo del rechazo.
     */
    observaciones: z
      .string()
      .trim()
      .min(
        1,
        'Las observaciones son obligatorias',
      )
      .max(
        500,
        'Las observaciones no pueden superar 500 caracteres',
      ),

    /**
     * Nueva fecha acordada con el cliente.
     * Es obligatoria para REPROGRAMACION.
     */
    nuevaFecha: isoDateSchema(
      'La nueva fecha',
    ).optional(),
  })
  .superRefine((data, ctx) => {
    // Reprogramación:
    // debe existir una nueva fecha.

    if (
      data.tipo === 'REPROGRAMACION' &&
      !data.nuevaFecha
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['nuevaFecha'],
        message:
          'Indica la nueva fecha de la visita',
      });
    }

    // Pago denegado:
    // exige una justificación del rechazo.
    //
    // Se mantiene el mismo campo observaciones
    // para no modificar el contrato HTTP.

    if (
      data.tipo === 'PAGO_DENEGADO' &&
      !data.observaciones.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['observaciones'],
        message:
          'Indica el motivo por el cual el cliente rechazó el pago.',
      });
    }
  });

// =====================================================
// APLICAR COBRO DE RUTA
// =====================================================

export const cobrarRutaSchema = z.object({
  idAsignacion: id,

  idPago: id,

  idEmpleado: id,

  monto: moneySchema(
    'Monto a aplicar',
    true,
  ),

  fecha: isoDateSchema(
    'Fecha del cobro',
  ),

  /**
   * Identificador único de la operación.
   * Evita procesar accidentalmente
   * el mismo cobro más de una vez.
   */
  claveOperacion: z.string().uuid(),
});

// =====================================================
// PERFIL DEL COBRADOR
// =====================================================

export const perfilCobradorSchema = z.object({
  telefono: z
    .string()
    .trim()
    .max(30)
    .refine(
      (v) =>
        v === '' ||
        (
          /^\+?[\d\s()-]+$/.test(v) &&
          v.replace(/\D/g, '').length >= 7 &&
          v.replace(/\D/g, '').length <= 15
        ),
      'El teléfono solo admite números, espacios, guiones y paréntesis (entre 7 y 15 dígitos)',
    ),

  fotoUrl: z
    .string()
    .max(1000)
    .refine(
      (v) => {
        if (!v) {
          return true;
        }

        try {
          return new URL(v).protocol === 'https:';
        } catch {
          return false;
        }
      },
      'La foto debe usar una URL HTTPS',
    ),
});

// =====================================================
// TIPOS INFERIDOS DE VALIDACIÓN
// =====================================================

export type AsignarDocumentoRuta =
  z.infer<typeof asignarDocumentoRutaSchema>;

export type RegistrarBitacoraRuta =
  z.infer<typeof registrarBitacoraRutaSchema>;

export type PerfilCobradorInput =
  z.infer<typeof perfilCobradorSchema>;

// =====================================================
// PERFIL DEL COBRADOR
// =====================================================

export interface CobradorPerfil {
  ID_EMPLEADO: number;
  NOMBRE: string;
  TELEFONO: string | null;
  PUESTO: string | null;
  EMAIL: string | null;
  FOTO_URL: string | null;
}

// =====================================================
// DOCUMENTO ASIGNADO A UNA RUTA
// =====================================================

export interface RutaAsignacion {
  ID_ASIGNACION: number;
  ID_DOCUMENTO: number;
  ID_CLIENTE: number;
  DOCUMENTO: string;
  CLIENTE: string;
  ID_EMPLEADO: number;
  COBRADOR: string;

  MONTO_ASIGNADO: number;
  MONTO_REGISTRADO: number;
  SALDO_DOCUMENTO: number;

  DIRECCION: string;
  LATITUD: number;
  LONGITUD: number;

  ID_MONEDA: number;
  MONEDA: string;

  ORDEN_VISITA: number;

  /**
   * Estado operativo de la parada.
   *
   * El repositorio debe encargarse de
   * actualizarlo después de registrar
   * una actividad.
   *
   * No representa necesariamente
   * un movimiento financiero.
   */
  ESTADO_VISITA: string;

  /**
   * Hora programada para la visita.
   * Formato HH:MM.
   */
  HORA_PROGRAMADA: string | null;

  /**
   * Hora real en que se registró la visita.
   * Formato HH:MM.
   */
  HORA_VISITA: string | null;
}

// =====================================================
// PLANIFICACIÓN DE LA RUTA
// =====================================================

export interface RutaPlanificacion {
  ID_RUTA: number;
  ID_EMPLEADO: number;
  RESPONSABLE: string | null;

  FECHA: string | null;
  ESTADO: string;
  RADIO_KM: number;

  /**
   * Primera parada con ubicación,
   * utilizada como referencia del radio.
   */
  ANCLA: {
    ID_ASIGNACION: number;
    LATITUD: number;
    LONGITUD: number;
    CLIENTE: string;
  } | null;
}

// =====================================================
// BITÁCORA DE COBRANZA
// =====================================================

export interface RutaBitacora {
  ID_BITACORA: number;
  ID_ASIGNACION: number;

  TIPO: string;
  MONTO: number | null;

  OBSERVACIONES: string;
  REFERENCIA: string | null;
  FECHA: string;

  COBRADOR: string;
  DOCUMENTO: string;

  ESTADO: string | null;
  MONEDA: string | null;

  REGISTRADO_POR: string | null;
}

// =====================================================
// RESUMEN DE OPERACIÓN DE RUTA
// =====================================================

export interface RutaOperacion {
  ruta: RutaPlanificacion;
  asignaciones: RutaAsignacion[];
  bitacora: RutaBitacora[];
  cobradores: CobradorPerfil[];
}

// =====================================================
// DOCUMENTOS DISPONIBLES PARA ASIGNAR
// =====================================================

export interface RutaDocumentoPendiente {
  ID_DOCUMENTO: number;
  DOCUMENTO: string;

  SALDO: number;
  DISPONIBLE: number;

  CLIENTE: string;

  ID_MONEDA: number;
  MONEDA: string;

  /**
   * Dirección registrada del cliente.
   */
  DIRECCION_CLIENTE: string | null;

  /**
   * Código de cobro del cliente.
   * Ejemplo: CR-00012.
   */
  CODIGO_COBRO: string;
}

// =====================================================
// PAGOS DISPONIBLES PARA RUTAS
// =====================================================

export interface RutaPagoDisponible {
  ID_PAGO: number;
  ID_CLIENTE: number;
  ID_MONEDA: number;

  REFERENCIA: string;

  DISPONIBLE: number;

  CLIENTE: string;
  MONEDA: string;
}
