import { z } from 'zod';
import { isoDateSchema, moneySchema } from '../validation';

export const ESTADOS_PAGO = [
  'NO_IDENTIFICADO',
  'NO_APLICADO',
  'APLICADO',
  'EN_CUENTA',
  'REVERSADO',
  'ANULADO',
] as const;

export const ESTADOS_PAGO_REGISTRO = [
  'NO_IDENTIFICADO',
  'NO_APLICADO',
  'EN_CUENTA',
] as const;

export const pagoSchema = z.object({
  idPago: z.number().int(),
  idCliente: z.number().int(),
  nombreCliente: z.string().nullable().optional(),
  idFormaPago: z.number().int(),
  idMoneda: z.number().int(),
  idBanco: z.number().int().nullable(),
  nombreBanco: z.string().nullable().optional(),
  fechaPago: z.string(),
  monto: z.number(),
  montoAplicado: z.number().optional(),
  montoDisponible: z.number().optional(),
  numeroReferencia: z.string().nullable(),
  estado: z.string(),
  idEmpleadoAnulacion: z.number().int().nullable(),
  nombreEmpleadoAnulacion: z.string().nullable().optional(),
  fechaAnulacion: z.string().nullable(),
  motivoAnulacion: z.string().nullable(),
});
export type Pago = z.infer<typeof pagoSchema>;

const pagoBaseSchema = z.object({
  idCliente: z.number().int().positive('Selecciona un cliente'),
  idFormaPago: z.number().int().positive('Selecciona una forma de pago'),
  idMoneda: z.number().int().positive('Selecciona una moneda'),
  idBanco: z.number().int().positive('El banco debe ser un ID válido').nullable().optional(),
  fechaPago: isoDateSchema('La fecha de pago'),
  monto: moneySchema('El monto', true),
  // Sin numeroReferencia: el sistema la asigna (PAG-AAAA-000001) y no se edita.
});

/** Parte del pago que se aplica a una factura o cargo al registrarlo. */
export const aplicacionNuevoPagoSchema = z.object({
  idDocumento: z.number().int().positive('Selecciona un documento válido'),
  montoAplicado: moneySchema('El monto a aplicar', true),
});

/**
 * Un pago nuevo nace con su destino, en una sola transacción:
 * - `aplicaciones`: se reparte entre una o varias facturas del cliente; la suma
 *   debe ser exactamente el monto del pago (no queda dinero suelto).
 * - `comoAnticipo`: el cliente aún no tiene factura; se crea el anticipo por
 *   el monto completo.
 * Sin ninguno de los dos el pago queda libre (p. ej. un depósito no identificado)
 * y se aplica después en Aplicación de pago.
 */
export const createPagoSchema = pagoBaseSchema.extend({
  estado: z.enum(ESTADOS_PAGO_REGISTRO).default('NO_APLICADO'),
  aplicaciones: z.array(aplicacionNuevoPagoSchema).max(50).optional(),
  comoAnticipo: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const aplicaciones = value.aplicaciones ?? [];
  if (aplicaciones.length && value.comoAnticipo) {
    ctx.addIssue({ code: 'custom', path: ['comoAnticipo'], message: 'Un pago se aplica a facturas o se registra como anticipo, no ambas cosas.' });
  }
  const ids = aplicaciones.map((a) => a.idDocumento);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['aplicaciones'], message: 'No se puede aplicar dos veces al mismo documento.' });
  }
  const suma = aplicaciones.reduce((s, a) => s + Math.round(a.montoAplicado * 100), 0);
  if (aplicaciones.length && suma !== Math.round(value.monto * 100)) {
    ctx.addIssue({ code: 'custom', path: ['aplicaciones'], message: 'La suma aplicada a los documentos debe ser igual al monto del pago.' });
  }
});
export type AplicacionNuevoPago = z.infer<typeof aplicacionNuevoPagoSchema>;
export type CreatePagoInput = z.infer<typeof createPagoSchema>;

export const updatePagoSchema = pagoBaseSchema.partial().extend({
  estado: z.enum(ESTADOS_PAGO_REGISTRO).optional(),
});
export type UpdatePagoInput = z.infer<typeof updatePagoSchema>;

export const anularPagoSchema = z.object({
  idEmpleadoAnulacion: z.number().int().positive('Selecciona el empleado que anula'),
  motivoAnulacion: z.string().trim().min(10, 'Describe el motivo de la anulación (mínimo 10 caracteres)').max(250, 'El motivo no puede superar 250 caracteres'),
  fechaAnulacion: isoDateSchema('La fecha de anulación').optional(),
});
export type AnularPagoInput = z.infer<typeof anularPagoSchema>;
