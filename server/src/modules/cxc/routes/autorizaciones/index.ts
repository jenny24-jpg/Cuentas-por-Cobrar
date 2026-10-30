import { Router } from 'express';
import * as controller from '../../controllers/autorizaciones/solicitudReversa.controller';
import { validarIdsDeRuta } from '../../../../shared/idParams';

const router = validarIdsDeRuta(Router());

// Reversas y anulaciones que esperan autorización de un ADMIN.
router.get('/solicitudes-reversa', controller.list);
// Antes de /:id para que "pendientes" y "conteo" no se tomen como id.
router.get('/solicitudes-reversa/pendientes', controller.pendientes);
router.get('/solicitudes-reversa/conteo', controller.contar);
router.get('/solicitudes-reversa/:id', controller.getOne);
router.post('/solicitudes-reversa', controller.crear);
router.post('/solicitudes-reversa/:id/aprobar', controller.aprobar);
router.post('/solicitudes-reversa/:id/rechazar', controller.rechazar);
router.post('/solicitudes-reversa/:id/cancelar', controller.cancelar);

export default router;
