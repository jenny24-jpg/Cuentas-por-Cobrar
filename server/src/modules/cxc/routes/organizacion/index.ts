import { Router } from 'express';
import * as empresaController from '../../controllers/organizacion/empresa.controller';
import * as clienteController from '../../controllers/organizacion/cliente.controller';
import * as sucursalController from '../../controllers/organizacion/sucursal.controller';
import * as rutaController from '../../controllers/organizacion/ruta.controller';
import * as rutaDetalleController from '../../controllers/organizacion/rutaDetalle.controller';

import * as operacion from '../../controllers/organizacion/rutaOperacion.controller';
import { validarIdsDeRuta } from '../../../../shared/idParams';
const router = validarIdsDeRuta(Router());
router.get('/rutas-pagos-disponibles', operacion.pagosDisponibles);
router.post('/rutas/:id/cobros', operacion.cobrar);
router.get('/rutas-documentos-pendientes', operacion.pendientes);
router.get('/rutas/:id/operacion', operacion.resumen);
router.post('/rutas/:id/asignaciones', operacion.asignar);
router.post('/rutas/:id/bitacora', operacion.registrar);
router.patch('/cobradores/:idEmpleado/perfil', operacion.perfil);

// --- Empresas ---
// /options va ANTES de /:id para que Express no confunda "options" con un id.
router.get('/empresas/options', empresaController.options);
router.get('/empresas/tipos-comercio', empresaController.tiposComercio);
router.get('/empresas', empresaController.list);
router.get('/empresas/:id', empresaController.getOne);
router.post('/empresas', empresaController.create);
router.patch('/empresas/:id', empresaController.update);
router.delete('/empresas/:id', empresaController.remove);

// --- Clientes ---
router.get('/clientes', clienteController.list);
router.post('/clientes', clienteController.create);
router.get('/clientes/:id', clienteController.getOne);
router.get('/clientes/:id/detalle', clienteController.detalle);
router.patch('/clientes/:id', clienteController.update);

// --- Sucursales ---
router.get('/sucursales', sucursalController.list);
router.get('/sucursales/:id', sucursalController.getOne);
router.post('/sucursales', sucursalController.create);
router.patch('/sucursales/:id', sucursalController.update);
router.delete('/sucursales/:id', sucursalController.remove);

// --- Rutas ---
router.get('/rutas', rutaController.list);
router.get('/rutas-por-empleado', rutaController.porEmpleado);
router.get('/rutas/:id/sucursal-sugerida', rutaController.sucursalSugerida);
router.get('/rutas/:id', rutaController.getOne);
router.post('/rutas', rutaController.create);
router.patch('/rutas/:id', rutaController.update);
router.post('/rutas/:id/cancelar', rutaController.cancelar);
router.post('/rutas/:id/finalizar', rutaController.finalizar);
router.delete('/rutas/:id', rutaController.remove);


// --- Paradas (detalle) de una ruta, anidadas bajo la ruta ---
router.get('/rutas/:id/detalle', rutaDetalleController.listByRuta);
router.post('/rutas/:id/detalle', rutaDetalleController.create);
router.patch('/rutas/detalle/:idDetalle', rutaDetalleController.update);
router.delete('/rutas/detalle/:idDetalle', rutaDetalleController.remove);

export default router;
