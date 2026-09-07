import { Router } from 'express';
import documentosRoutes from './documentos';

const router = Router();

// Rutas del módulo Documentos - Kevin
router.use('/', documentosRoutes);

export default router;