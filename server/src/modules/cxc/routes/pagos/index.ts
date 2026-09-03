import { Router } from 'express';
import * as pago from '../../controllers/pagos/pago.controller';
import * as aplicacion from '../../controllers/pagos/aplicacionPago.controller';
import * as anticipo from '../../controllers/pagos/anticipo.controller';
import * as recibo from '../../controllers/pagos/recibo.controller';
import * as forma from '../../controllers/pagos/formaPago.controller';
import * as formaRepo from '../../repositories/pagos/formaPago.repository';
import * as pagoRepo from '../../repositories/pagos/pago.repository';
const router=Router();
for (const [path,c] of [['/pagos',pago],['/aplicaciones-pago',aplicacion],['/anticipos',anticipo],['/recibos',recibo],['/formas-pago',forma]] as const){router.get(path,c.list);router.get(`${path}/:id`,c.getOne);router.post(path,c.create);router.patch(`${path}/:id`,c.update);router.delete(`${path}/:id`,c.remove);}
router.get('/catalogos/pagos', async (_req,res,next)=>{try{res.json(await pagoRepo.listOptions());}catch(e){next(e);}});
router.get('/catalogos/formas-pago', async (_req,res,next)=>{try{res.json(await formaRepo.listActivas());}catch(e){next(e);}});
export default router;
