import { createAplicacionPagoSchema, updateAplicacionPagoSchema, buildPaginationMeta, type PaginatedResponse, type AplicacionPago } from '@erp/contracts';
import * as repository from '../../repositories/pagos/aplicacionPago.repository';
import { NotFoundError } from '../cobranza/gestionCobro.service';
export async function listAplicacionesPago(q:{page?:string;limit?:string;search?:string}):Promise<PaginatedResponse<AplicacionPago>>{const page=Math.max(1,Number(q.page)||1);const limit=Math.min(100,Math.max(1,Number(q.limit)||20));const {data,total}=await repository.findAll({page,limit,search:q.search});return{data,meta:buildPaginationMeta(total,page,limit)};}
export async function getAplicacionPago(id:number):Promise<AplicacionPago>{const item=await repository.findById(id);if(!item)throw new NotFoundError('AplicacionPago '+id+' no encontrado');return item;}
export async function createAplicacionPago(raw:unknown):Promise<AplicacionPago>{const input=createAplicacionPagoSchema.parse(raw);const id=await repository.create(input);return getAplicacionPago(id);}
export async function updateAplicacionPago(id:number,raw:unknown):Promise<AplicacionPago>{const input=updateAplicacionPagoSchema.parse(raw);await getAplicacionPago(id);await repository.update(id,input);return getAplicacionPago(id);}
export async function deleteAplicacionPago(id:number):Promise<void>{await getAplicacionPago(id);await repository.remove(id);}
