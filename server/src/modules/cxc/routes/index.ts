import { Router } from 'express';
import cobranzaRoutes from './cobranza';
import catalogosRoutes from './catalogos.routes';
import pagosRoutes from './pagos';

const router = Router();

// Catálogos de solo lectura para selects de formularios (cliente, empleado, documento)
router.use('/catalogos', catalogosRoutes);

// Cada área monta su propio sub-router aquí. Mantener el prefijo alineado
// con el nombre del área para que las rutas queden legibles:
// /api/cxc/gestiones-cobro, /api/cxc/promesas-pago, etc. (cobranza)
router.use('/', cobranzaRoutes);
// router.use('/', documentosRoutes);   // Kevin
router.use('/', pagosRoutes);
// router.use('/', creditoRoutes);       // Ángel

export default router;
