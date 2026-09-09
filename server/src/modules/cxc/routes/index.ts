import { Router } from 'express';
import organizacionRoutes from './organizacion';
import cobranzaRoutes from './cobranza';
import creditoRoutes from './credito';
import catalogosRoutes from './catalogos.routes';
import pagosRoutes from './pagos';

const router = Router();

// Catálogos para los formularios
router.use('/catalogos', catalogosRoutes);

// Cada área monta su propio sub-router aquí. Mantener el prefijo alineado
// con el nombre del área para que las rutas queden legibles:
// /api/cxc/empresas, /api/cxc/rutas, etc. (organización)
router.use('/', organizacionRoutes);

// Rutas de Cobranza
router.use('/', cobranzaRoutes);

// Rutas de Pagos
router.use('/', pagosRoutes);

// Rutas de Crédito
router.use('/', creditoRoutes);

// Cuando esté disponible el módulo de Documentos:
// router.use('/', documentosRoutes);

export default router;