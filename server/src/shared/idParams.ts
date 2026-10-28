import type { Router } from 'express';
import { BadRequestError } from './errors/AppError';

/** Parámetros de ruta que son identificadores numéricos de base de datos. */
const ID_PARAMS = ['id', 'idCliente', 'idCuota', 'idDetalle', 'idEmpleado', 'idHistorial'] as const;

/** Entero positivo, sin signo, sin ceros a la izquierda y dentro del rango de un NUMBER(10). */
const ID_VALIDO = /^[1-9]\d{0,9}$/;

/**
 * Rechaza con 400 cualquier identificador de la URL que no sea un entero positivo
 * (`abc`, `0`, `-5`, `1.5`, `1e3`...) antes de que llegue al servicio o a Oracle.
 * Debe registrarse en cada Router: `router.param` no se hereda entre routers montados.
 */
export function validarIdsDeRuta(router: Router): Router {
  for (const nombre of ID_PARAMS) {
    router.param(nombre, (_req, _res, next, valor: string) => {
      next(ID_VALIDO.test(valor) ? undefined : new BadRequestError('El identificador de la solicitud no es válido.'));
    });
  }
  return router;
}
