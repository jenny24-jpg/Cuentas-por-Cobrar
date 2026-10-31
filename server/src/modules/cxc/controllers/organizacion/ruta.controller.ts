
import {
  Request,
  Response,
  NextFunction,
} from 'express';

import * as rutaService from '../../services/organizacion/ruta.service';

// =====================================================
// LISTAR RUTAS
// =====================================================

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rutaService.listRutas({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      search: req.query.search as string | undefined,
      idEmpleado: req.query.idEmpleado as string | undefined,
      idSucursal: req.query.idSucursal as string | undefined,
      fecha: req.query.fecha as string | undefined,
      excluirId: req.query.excluirId as string | undefined,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// RESUMEN DE RUTAS POR EMPLEADO
// =====================================================

export async function porEmpleado(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rutaService.listRutasPorEmpleado({
      search: req.query.search as string | undefined,
      idSucursal: req.query.idSucursal as string | undefined,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// SUCURSAL SUGERIDA
// =====================================================

/**
 * Conserva la funcionalidad incorporada en develop.
 *
 * Consulta la sucursal sugerida para una ruta
 * según las reglas del servicio.
 */
export async function sucursalSugerida(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const resultado = await rutaService.sugerirSucursal(
      Number(req.params.id),
    );

    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// CONSULTAR RUTA POR ID
// =====================================================

export async function getOne(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ruta = await rutaService.getRuta(
      Number(req.params.id),
    );

    res.json(ruta);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// CREAR RUTA
// =====================================================

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ruta = await rutaService.createRuta(
      req.body,
    );

    res.status(201).json(ruta);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// ACTUALIZAR RUTA
// =====================================================

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ruta = await rutaService.updateRuta(
      Number(req.params.id),
      req.body,
    );

    res.json(ruta);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// FINALIZAR RUTA
// =====================================================

/**
 * Funcionalidad de galeano:
 *
 * Finaliza formalmente una ruta de cobranza.
 *
 * POST /cxc/rutas/:id/finalizar
 *
 * El servicio y el repositorio verifican:
 *
 * - Ruta en estado EN_PROCESO.
 * - Existencia de paradas.
 * - Resultados definitivos de cobranza.
 * - Ausencia de visitas pendientes.
 *
 * Esta operación no genera pagos ni recibos.
 */
export async function finalizar(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ruta = await rutaService.finalizarRuta(
      Number(req.params.id),
    );

    res.json(ruta);
  } catch (err) {
    next(err);
  }
}

export async function cancelar(req: Request, res: Response, next: NextFunction) {
  try {
    const ruta = await rutaService.cancelarRuta(Number(req.params.id));
    res.json(ruta);
  } catch (err) {
    next(err);
  }
}

// =====================================================
// ELIMINAR RUTA
// =====================================================

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await rutaService.deleteRuta(
      Number(req.params.id),
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
