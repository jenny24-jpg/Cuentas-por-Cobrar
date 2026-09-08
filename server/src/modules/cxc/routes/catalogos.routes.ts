import { Router, Request, Response, NextFunction } from 'express';
import * as catalogosRepository from '../repositories/catalogos.repository';

const router = Router();

router.get('/clientes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientes = await catalogosRepository.listClientesActivos(req.query.search as string | undefined);
    res.json(clientes);
  } catch (err) {
    next(err);
  }
});

router.get('/empleados', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const empleados = await catalogosRepository.listEmpleadosActivos();
    res.json(empleados);
  } catch (err) {
    next(err);
  }
});

router.get('/clientes/:idCliente/documentos-pendientes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documentos = await catalogosRepository.listDocumentosPendientesPorCliente(Number(req.params.idCliente));
    res.json(documentos);
  } catch (err) {
    next(err);
  }
});

export default router;
