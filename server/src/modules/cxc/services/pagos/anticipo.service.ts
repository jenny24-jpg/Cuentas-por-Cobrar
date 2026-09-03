import { createAnticipoSchema, updateAnticipoSchema, buildPaginationMeta, type PaginatedResponse, type Anticipo } from '@erp/contracts';
import * as repository from '../../repositories/pagos/anticipo.repository';
import { NotFoundError } from '../cobranza/gestionCobro.service';
export async function listAnticipos(q:{page?:string;limit?:string;search?:string}):Promise<PaginatedResponse<Anticipo>>{const page=Math.max(1,Number(q.page)||1);const limit=Math.min(100,Math.max(1,Number(q.limit)||20));const {data,total}=await repository.findAll({page,limit,search:q.search});return{data,meta:buildPaginationMeta(total,page,limit)};}
export async function getAnticipo(id:number):Promise<Anticipo>{const item=await repository.findById(id);if(!item)throw new NotFoundError('Anticipo '+id+' no encontrado');return item;}
export async function createAnticipo(raw:unknown):Promise<Anticipo>{const input=createAnticipoSchema.parse(raw);const id=await repository.create(input);return getAnticipo(id);}
export async function updateAnticipo(id:number,raw:unknown):Promise<Anticipo>{const input=updateAnticipoSchema.parse(raw);await getAnticipo(id);await repository.update(id,input);return getAnticipo(id);}
export async function deleteAnticipo(id:number):Promise<void>{await getAnticipo(id);await repository.remove(id);}
