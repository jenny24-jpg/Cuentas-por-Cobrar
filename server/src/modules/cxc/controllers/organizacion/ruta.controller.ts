
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
    });

    res.json(result);
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
 * Finaliza formalmente una ruta de cobranza.
 *
 * Endpoint previsto:
 * POST /cxc/rutas/:id/finalizar
 *
 * El servicio y el repositorio validan:
 *
 * - Que la ruta esté EN_PROCESO.
 * - Que tenga paradas asignadas.
 * - Que todas tengan resultados definitivos.
 * - Que no existan visitas pendientes.
 * - Que la ruta no esté ya completada o cancelada.
 *
 * No modifica montos ni genera pagos.
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
