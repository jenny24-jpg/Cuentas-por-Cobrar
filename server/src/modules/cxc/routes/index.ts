import { Router } from 'express';
import organizacionRoutes from './organizacion';

const router = Router();

// Cada área monta su propio sub-router aquí. Mantener el prefijo alineado
// con el nombre del área para que las rutas queden legibles:
// /api/cxc/empresas, /api/cxc/rutas, etc. (organización)
router.use('/', organizacionRoutes);
// router.use('/', cobranzaRoutes);      // Kevin/rama cobranza-catalogos
// router.use('/', documentosRoutes);    // Kevin
// router.use('/', pagosRoutes);         // Laura
// router.use('/', creditoRoutes);       // Ángel

export default router;