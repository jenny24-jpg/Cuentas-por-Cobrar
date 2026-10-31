import { Router, Request, Response, NextFunction } from 'express';
import * as catalogosRepository from '../repositories/catalogos.repository';
import { listSegmentos } from '../repositories/organizacion/cliente.repository';
import * as zonaCobroRepository from '../repositories/organizacion/zonaCobro.repository';
import { validarIdsDeRuta } from '../../../shared/idParams';

const router = validarIdsDeRuta(Router());

router.get('/clientes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ?conSaldo=1: solo clientes con documentos pendientes de pago (formulario de pagos).
    const clientes = await catalogosRepository.listClientesActivos(req.query.search as string | undefined, {
      conSaldo: req.query.conSaldo === '1',
    });
    res.json(clientes);
  } catch (err) {
    next(err);
  }
});

// Segmentos de cliente (A/B/C/D) con su reducción de mora, desde la base.
router.get('/segmentos', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listSegmentos());
  } catch (err) {
    next(err);
  }
});

// Zonas de cobro (territorio de rutas y ubicación de clientes), desde la base.
router.get('/zonas-cobro', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await zonaCobroRepository.listActivas());
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

router.get('/clientes/:idCliente/anticipos-disponibles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const anticipos = await catalogosRepository.listAnticiposDisponiblesPorCliente(Number(req.params.idCliente));
    res.json(anticipos);
  } catch (err) {
    next(err);
  }
});


router.get('/monedas', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const monedas = await catalogosRepository.listMonedas();
    res.json(monedas);
  } catch (err) {
    next(err);
  }
});

router.get('/formas-pago', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const formasPago = await catalogosRepository.listFormasPagoActivas();
    res.json(formasPago);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/notas-credito',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const notas =
        await catalogosRepository.listNotasCreditoActivas();

      res.json(notas);
    } catch (err) {
      next(err);
    }
  },
);

export default router;