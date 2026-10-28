import { Router } from 'express';
import * as controller from '../controllers/reportes.controller';
import { validarIdsDeRuta } from '../../../shared/idParams';

const router = validarIdsDeRuta(Router());

router.get('/reportes/antiguedad-saldos', controller.antiguedadSaldos);
router.get('/reportes/estado-cuenta/:idCliente', controller.estadoCuenta);
router.get('/reportes/libro-ventas', controller.libroVentas);
router.get('/reportes/estadistica-ventas', controller.estadisticaVentas);
router.get('/reportes/estadistica-cobranza', controller.estadisticaCobranza);

export default router;
