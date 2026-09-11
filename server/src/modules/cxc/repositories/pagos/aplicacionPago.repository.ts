import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import type { AplicacionPago, CreateAplicacionPagoInput, UpdateAplicacionPagoInput } from '@erp/contracts';
interface Row{ID_APLICACION:number;ID_PAGO:number;REFERENCIA_PAGO:string|null;ID_DOCUMENTO:number;SERIE_DOCUMENTO:string|null;NUMERO_DOCUMENTO:string|null;FECHA_APLICACION:Date;MONTO_APLICADO:number;ID_EMPLEADO:number|null;NOMBRE_EMPLEADO:string|null}
const mapRow=(r:Row):AplicacionPago=>({idAplicacion:r.ID_APLICACION,idPago:r.ID_PAGO,referenciaPago:r.REFERENCIA_PAGO,idDocumento:r.ID_DOCUMENTO,referenciaDocumento:[r.SERIE_DOCUMENTO,r.NUMERO_DOCUMENTO].filter(Boolean).join('-')||`Documento #${r.ID_DOCUMENTO}`,fechaAplicacion:r.FECHA_APLICACION?.toISOString()??'',montoAplicado:r.MONTO_APLICADO,idEmpleado:r.ID_EMPLEADO,nombreEmpleado:r.NOMBRE_EMPLEADO});
const SELECT_BASE=`SELECT a.ID_APLICACION,a.ID_PAGO,p.NUMERO_REFERENCIA AS REFERENCIA_PAGO,a.ID_DOCUMENTO,d.SERIE AS SERIE_DOCUMENTO,d.NUMERO_DOCUMENTO,a.FECHA_APLICACION,a.MONTO_APLICADO,a.ID_EMPLEADO,CASE WHEN e.ID_EMPLEADO IS NULL THEN NULL ELSE TRIM(e.NOMBRE||' '||NVL(e.APELLIDO,'')) END AS NOMBRE_EMPLEADO FROM CXC_APLICACION_PAGOS a JOIN CXC_PAGOS p ON p.ID_PAGO=a.ID_PAGO JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO=a.ID_DOCUMENTO LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO=a.ID_EMPLEADO`;
export async function findAll({page,limit,search}:{page:number;limit:number;search?:string}){const c=await getConnection();try{const o=(page-1)*limit;const w=search?`WHERE UPPER(p.NUMERO_REFERENCIA) LIKE UPPER(:search) OR UPPER(d.SERIE) LIKE UPPER(:search) OR UPPER(d.NUMERO_DOCUMENTO) LIKE UPPER(:search) OR UPPER(e.NOMBRE||' '||NVL(e.APELLIDO,'')) LIKE UPPER(:search) OR TO_CHAR(a.ID_APLICACION) LIKE :search`:'';const sb=search?{search:`%${search}%`}:{ };const d=await c.execute<Row>(`${SELECT_BASE} ${w} ORDER BY a.FECHA_APLICACION DESC,a.ID_APLICACION DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,{...sb,offset:o,limit});const n=await c.execute<{TOTAL:number}>(`SELECT COUNT(*) TOTAL FROM CXC_APLICACION_PAGOS a JOIN CXC_PAGOS p ON p.ID_PAGO=a.ID_PAGO JOIN CXC_DOCUMENTOS d ON d.ID_DOCUMENTO=a.ID_DOCUMENTO LEFT JOIN EMPLEADO e ON e.ID_EMPLEADO=a.ID_EMPLEADO ${w}`,sb);return{data:(d.rows??[]).map(mapRow),total:n.rows?.[0]?.TOTAL??0};}finally{await c.close();}}
export async function findById(id:number){const c=await getConnection();try{const r=await c.execute<Row>(`${SELECT_BASE} WHERE a.ID_APLICACION=:id`,{id});return r.rows?.[0]?mapRow(r.rows[0]):null;}finally{await c.close();}}
export async function create(i:CreateAplicacionPagoInput){const c=await getConnection();try{const r=await c.execute<{id:number[]}>(`INSERT INTO CXC_APLICACION_PAGOS (ID_PAGO,ID_DOCUMENTO,FECHA_APLICACION,MONTO_APLICADO,ID_EMPLEADO) VALUES (:idPago,:idDocumento,TO_DATE(:fechaAplicacion,'YYYY-MM-DD'),:montoAplicado,:idEmpleado) RETURNING ID_APLICACION INTO :id`,{idPago:i.idPago,idDocumento:i.idDocumento,fechaAplicacion:i.fechaAplicacion,montoAplicado:i.montoAplicado,idEmpleado:i.idEmpleado??null,id:{dir:oracledb.BIND_OUT,type:oracledb.NUMBER}});await c.commit();return r.outBinds!.id[0];}catch(e){await c.rollback();throw e;}finally{await c.close();}}
export async function update(id:number,i:UpdateAplicacionPagoInput){const f:string[]=[];const b:any={id};if(i.idPago!==undefined){f.push('ID_PAGO=:idPago');b.idPago=i.idPago;}if(i.idDocumento!==undefined){f.push('ID_DOCUMENTO=:idDocumento');b.idDocumento=i.idDocumento;}if(i.fechaAplicacion!==undefined){f.push(`FECHA_APLICACION=TO_DATE(:fechaAplicacion,'YYYY-MM-DD')`);b.fechaAplicacion=i.fechaAplicacion;}if(i.montoAplicado!==undefined){f.push('MONTO_APLICADO=:montoAplicado');b.montoAplicado=i.montoAplicado;}if(i.idEmpleado!==undefined){f.push('ID_EMPLEADO=:idEmpleado');b.idEmpleado=i.idEmpleado;}if(!f.length)return;const c=await getConnection();try{await c.execute(`UPDATE CXC_APLICACION_PAGOS SET ${f.join(',')} WHERE ID_APLICACION=:id`,b);await c.commit();}catch(e){await c.rollback();throw e;}finally{await c.close();}}
export async function remove(id:number){const c=await getConnection();try{await c.execute(`DELETE FROM CXC_APLICACION_PAGOS WHERE ID_APLICACION=:id`,{id});await c.commit();}catch(e){await c.rollback();throw e;}finally{await c.close();}}

export async function sumAplicadoPorPago(idPago: number, excludeId?: number): Promise<number> {
  const c = await getConnection();
  try {
    const result = await c.execute<{ TOTAL: number }>(
      `SELECT NVL(SUM(MONTO_APLICADO), 0) AS TOTAL
         FROM CXC_APLICACION_PAGOS
        WHERE ID_PAGO = :idPago
          AND (:excludeId IS NULL OR ID_APLICACION <> :excludeId)`,
      { idPago, excludeId: excludeId ?? null },
    );
    return Number(result.rows?.[0]?.TOTAL ?? 0);
  } finally {
    await c.close();
  }
}
