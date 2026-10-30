import {Request,Response,NextFunction} from 'express'; import * as service from '../../services/pagos/aplicacionPago.service';
import { conEmpleadoActual } from '../../../auth/empleadoActual';
export async function list(req:Request,res:Response,next:NextFunction){try{res.json(await service.listAplicacionesPago({page:req.query.page as string|undefined,limit:req.query.limit as string|undefined,search:req.query.search as string|undefined}));}catch(e){next(e);}}
export async function getOne(req:Request,res:Response,next:NextFunction){try{res.json(await service.getAplicacionPago(Number(req.params.id)));}catch(e){next(e);}}
export async function create(req:Request,res:Response,next:NextFunction){try{res.status(201).json(await service.createAplicacionPago(await conEmpleadoActual(req), req.auth?.rol !== 'ADMIN'));}catch(e){next(e);}}
export async function update(req:Request,res:Response,next:NextFunction){try{res.json(await service.updateAplicacionPago(Number(req.params.id),req.body));}catch(e){next(e);}}
export async function remove(req:Request,res:Response,next:NextFunction){try{await service.deleteAplicacionPago(Number(req.params.id));res.status(204).send();}catch(e){next(e);}}
export async function reversar(req:Request,res:Response,next:NextFunction){try{res.json(await service.reversarAplicacionPago(Number(req.params.id),await conEmpleadoActual(req,'idEmpleadoReversa')));}catch(e){next(e);}}
export async function aprobar(req:Request,res:Response,next:NextFunction){try{const body=await conEmpleadoActual(req,'idEmpleadoAprobador');res.json(await service.aprobarSolicitudAplicacionPago(Number(req.params.id),body.idEmpleadoAprobador));}catch(e){next(e);}}
export async function rechazar(req:Request,res:Response,next:NextFunction){try{const body=await conEmpleadoActual(req,'idEmpleadoAprobador');res.json(await service.rechazarSolicitudAplicacionPago(Number(req.params.id),body,body.idEmpleadoAprobador));}catch(e){next(e);}}
