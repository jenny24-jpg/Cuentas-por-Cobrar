import { Router } from 'express';
import { solicitarDesde } from '../../controllers/autorizaciones/solicitudReversa.controller';
import * as condicionCreditoController from '../../controllers/credito/condicionCredito.controller';
import * as notaCreditoController from '../../controllers/credito/notaCredito.controller';
import * as aplicacionNotaCreditoController from '../../controllers/credito/aplicacionNotaCredito.controller';
import * as moraController from '../../controllers/credito/mora.controller';
import { validarIdsDeRuta } from '../../../../shared/idParams';

const router = validarIdsDeRuta(Router());

// --- Condiciones de crédito ---
router.get('/condiciones-credito', condicionCreditoController.list);
router.get('/condiciones-credito/:id', condicionCreditoController.getOne);
router.post('/condiciones-credito', condicionCreditoController.create);
router.patch('/condiciones-credito/:id', condicionCreditoController.update);
router.delete('/condiciones-credito/:id', condicionCreditoController.remove);

router.get('/notas-credito', notaCreditoController.list);
// Antes de /notas-credito/:id para que "siguiente-numero" no se tome como id.
router.get('/notas-credito/siguiente-numero', notaCreditoController.siguienteNumero);
router.get('/notas-credito/:id', notaCreditoController.getOne);
router.post('/notas-credito', notaCreditoController.create);
router.patch('/notas-credito/:id', notaCreditoController.update);
router.delete('/notas-credito/:id', notaCreditoController.remove);
router.post('/notas-credito/:id/anular', solicitarDesde('ANULACION_NOTA_CREDITO', 'motivoAnulacion'));
router.post('/notas-credito/:id/aprobar', notaCreditoController.aprobar);
router.post('/notas-credito/:id/rechazar', notaCreditoController.rechazar);

router.get(
  '/aplicaciones-nota-credito',
  aplicacionNotaCreditoController.list,
);

router.get(
  '/aplicaciones-nota-credito/:id',
  aplicacionNotaCreditoController.getOne,
);

router.post(
  '/aplicaciones-nota-credito',
  aplicacionNotaCreditoController.create,
);

router.patch(
  '/aplicaciones-nota-credito/:id',
  aplicacionNotaCreditoController.update,
);

router.delete(
  '/aplicaciones-nota-credito/:id',
  aplicacionNotaCreditoController.remove,
);

router.post(
  '/aplicaciones-nota-credito/:id/reversar',
  solicitarDesde('REVERSA_APLICACION_NC', 'motivoReversa'),
);



router.post('/mora/recalcular', moraController.recalcular);
router.get('/mora/cartera', moraController.cartera);
router.get('/mora/cliente/:idCliente', moraController.resumenCliente);
router.get('/mora', moraController.list);
router.get('/mora/:id', moraController.getOne);


export default router;  