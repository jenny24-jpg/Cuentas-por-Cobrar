import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { validarIdsDeRuta } from '../../../shared/idParams';

const router = validarIdsDeRuta(Router());

router.get('/dashboard/resumen', dashboardController.getResumen);

export default router;
