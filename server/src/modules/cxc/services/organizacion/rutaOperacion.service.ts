import { z } from 'zod';
import { asignarDocumentoRutaSchema, registrarBitacoraRutaSchema, perfilCobradorSchema, cobrarRutaSchema } from '@erp/contracts';
import * as repo from '../../repositories/organizacion/rutaOperacion.repository';
import { createAplicacionPago, getAplicacionPago } from '../pagos/aplicacionPago.service';
import * as pagoRepository from '../../repositories/pagos/pago.repository';
import * as catalogosRepository from '../../repositories/catalogos.repository';
import { BadRequestError, ConflictError } from '../../../../shared/errors/AppError';
import { businessTodayIso } from '../../../../shared/date';
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
export const resumen = (ruta: unknown) => repo.resumen(id(ruta));
export const pendientes = () => repo.pendientes();
export const pagosDisponibles = () => repo.pagosDisponibles();
export const asignar = (ruta: unknown, body: unknown) => repo.asignar(id(ruta), asignarDocumentoRutaSchema.parse(body));
export const registrar = (ruta: unknown, body: unknown) => repo.registrar(id(ruta), registrarBitacoraRutaSchema.parse(body));
export const perfil = (empleado: unknown, body: unknown) => repo.perfil(id(empleado), perfilCobradorSchema.parse(body));
export async function cobrar(ruta: unknown, body: unknown) {
  const input=cobrarRutaSchema.parse(body);
  const { idDocumento, fechaRuta } = await repo.documentoAsignado(id(ruta),input.idAsignacion);
  // Los cobros de ruta ocurren desde el día de la ruta: ni antes de ella ni con fecha anterior.
  if (fechaRuta && fechaRuta > businessTodayIso()) throw new ConflictError('La ruta todavía no inicia; los cobros se registran a partir de su fecha planificada.');
  if (fechaRuta && input.fecha < fechaRuta) throw new BadRequestError('La fecha del cobro no puede ser anterior a la fecha de la ruta.');
  // Pago ya registrado y libre: solo se aplica a la factura asignada.
  if (input.idPago) {
    return createAplicacionPago({idDocumento,idPago:input.idPago,idEmpleado:input.idEmpleado,
      montoAplicado:input.monto,fechaAplicacion:input.fecha,idRutaDetalle:input.idAsignacion,claveRuta:input.claveOperacion});
  }

  // El cobrador recibe el dinero: se registra el pago y se aplica en la misma operación.
  // Un pago nuevo siempre lleva la fecha de hoy.
  if (input.fecha !== businessTodayIso()) {
    throw new BadRequestError('Un cobro con pago nuevo se registra con la fecha de hoy.');
  }
  const formas = await catalogosRepository.listFormasPagoActivas();
  if (!formas.some((f) => f.id === input.idFormaPago)) {
    throw new BadRequestError('La forma de pago no existe o está inactiva.');
  }
  const idAplicacion = await pagoRepository.cobrarEnRuta({
    idRutaDetalle: input.idAsignacion,
    idDocumento,
    idFormaPago: input.idFormaPago!,
    idBanco: input.idBanco ?? null,
    monto: input.monto,
    fecha: input.fecha,
    idEmpleado: input.idEmpleado,
    claveRuta: input.claveOperacion,
  });
  return getAplicacionPago(idAplicacion);
}
