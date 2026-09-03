import { createPagoSchema, updatePagoSchema, buildPaginationMeta, type PaginatedResponse, type Pago } from '@erp/contracts';
import * as repository from '../../repositories/pagos/pago.repository';
import { NotFoundError } from '../cobranza/gestionCobro.service';
export async function listPagos(q:{page?:string;limit?:string;search?:string}):Promise<PaginatedResponse<Pago>>{const page=Math.max(1,Number(q.page)||1);const limit=Math.min(100,Math.max(1,Number(q.limit)||20));const {data,total}=await repository.findAll({page,limit,search:q.search});return{data,meta:buildPaginationMeta(total,page,limit)};}
export async function getPago(id:number):Promise<Pago>{const item=await repository.findById(id);if(!item)throw new NotFoundError('Pago '+id+' no encontrado');return item;}
export async function createPago(raw:unknown):Promise<Pago>{const input=createPagoSchema.parse(raw);const id=await repository.create(input);return getPago(id);}
export async function updatePago(id:number,raw:unknown):Promise<Pago>{const input=updatePagoSchema.parse(raw);await getPago(id);await repository.update(id,input);return getPago(id);}
export async function deletePago(id:number):Promise<void>{await getPago(id);await repository.remove(id);}
