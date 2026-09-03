import { createReciboSchema, updateReciboSchema, buildPaginationMeta, type PaginatedResponse, type Recibo } from '@erp/contracts';
import * as repository from '../../repositories/pagos/recibo.repository';
import { NotFoundError } from '../cobranza/gestionCobro.service';
export async function listRecibos(q:{page?:string;limit?:string;search?:string}):Promise<PaginatedResponse<Recibo>>{const page=Math.max(1,Number(q.page)||1);const limit=Math.min(100,Math.max(1,Number(q.limit)||20));const {data,total}=await repository.findAll({page,limit,search:q.search});return{data,meta:buildPaginationMeta(total,page,limit)};}
export async function getRecibo(id:number):Promise<Recibo>{const item=await repository.findById(id);if(!item)throw new NotFoundError('Recibo '+id+' no encontrado');return item;}
export async function createRecibo(raw:unknown):Promise<Recibo>{const input=createReciboSchema.parse(raw);const id=await repository.create(input);return getRecibo(id);}
export async function updateRecibo(id:number,raw:unknown):Promise<Recibo>{const input=updateReciboSchema.parse(raw);await getRecibo(id);await repository.update(id,input);return getRecibo(id);}
export async function deleteRecibo(id:number):Promise<void>{await getRecibo(id);await repository.remove(id);}
