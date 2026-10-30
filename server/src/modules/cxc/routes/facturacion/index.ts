import { Router } from 'express';
import { solicitarDesde } from '../../controllers/autorizaciones/solicitudReversa.controller';
import * as controller from '../../controllers/facturacion/factura.controller';
import { validarIdsDeRuta } from '../../../../shared/idParams';

const router = validarIdsDeRuta(Router());

// Facturación electrónica (FEL) simulada. /validar corre las reglas de la SAT
// simulada sin guardar; POST /facturas certifica y crea el documento por cobrar.
router.get('/facturas', controller.list);
router.post('/facturas/validar', controller.validar);
router.post('/facturas', controller.emitir);
router.get('/facturas/:id', controller.getOne);
router.post('/facturas/:id/anular', solicitarDesde('ANULACION_FACTURA_FEL', 'motivoAnulacion'));

export default router;
