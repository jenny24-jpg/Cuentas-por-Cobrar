import { Router } from 'express';
import cobranzaRoutes from './cobranza';
import creditoRoutes from './credito';
import catalogosRoutes from './catalogos.routes';
import pagosRoutes from './pagos';

const router = Router();

// Catálogos para los formularios
router.use('/catalogos', catalogosRoutes);

// Rutas de Cobranza
router.use('/', cobranzaRoutes);

// Rutas de Pagos
router.use('/', pagosRoutes);

// Rutas de Crédito
router.use('/', creditoRoutes);

// Cuando esté disponible el módulo de Documentos:
// router.use('/', documentosRoutes);

export default router;