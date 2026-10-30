import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import {
  DIAS_PROXIMOS_A_VENCER,
  type CarteraMoraDocumento,
  type EstadoCarteraMora,
  type Mora,
  type ResumenMoraCliente,
} from '@erp/contracts';
import { BadRequestError } from '../../../../shared/errors/AppError';
import { siguienteNumeroDocumento } from '../../shared/correlativos';
import { roundMoney } from '../../shared/financialRules';
import { businessTodayIso } from '../../../../shared/date';

interface MoraRow {
  ID_MORA: number;
  ID_DOCUMENTO: number;
  DIAS_MORA: number | null;
  SALDO_VENCIDO: number | null;
  PORCENTAJE_MORA: number | null;
  MONTO_MORA: number | null;
  FECHA_CALCULO: Date | null;
  ESTADO: Mora['estado'];
}

function mapRow(row: MoraRow): Mora {
  return {
    idMora: row.ID_MORA,
    idDocumento: row.ID_DOCUMENTO,
    diasMora: row.DIAS_MORA,
    saldoVencido: row.SALDO_VENCIDO,
    porcentajeMora: row.PORCENTAJE_MORA,
    montoMora: row.MONTO_MORA,
    fechaCalculo: row.FECHA_CALCULO
      ? row.FECHA_CALCULO.toISOString()
      : null,
    estado: row.ESTADO,
  };
}

const SELECT_BASE = `
  SELECT
    ID_MORA,
    ID_DOCUMENTO,
    DIAS_MORA,
    SALDO_VENCIDO,
    PORCENTAJE_MORA,
    MONTO_MORA,
    FECHA_CALCULO,
    ESTADO
  FROM CXC_MORA
`;

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{
  data: Mora[];
  total: number;
}> {
  const conn = await getConnection();

  try {
    const offset = (params.page - 1) * params.limit;

    const whereClause = params.search
      ? `
        WHERE TO_CHAR(ID_MORA) LIKE :search
           OR TO_CHAR(ID_DOCUMENTO) LIKE :search
           OR TO_CHAR(DIAS_MORA) LIKE :search
           OR TO_CHAR(SALDO_VENCIDO) LIKE :search
           OR TO_CHAR(PORCENTAJE_MORA) LIKE :search
           OR TO_CHAR(MONTO_MORA) LIKE :search
           OR UPPER(ESTADO) LIKE UPPER(:search)
           OR ID_DOCUMENTO IN (SELECT dx.ID_DOCUMENTO FROM CXC_DOCUMENTOS dx LEFT JOIN CLIENTE cx ON cx.ID_CLIENTE = dx.ID_CLIENTE
             WHERE UPPER(NVL(cx.NOMBRE, '')) LIKE UPPER(:search)
                OR UPPER(NVL(dx.SERIE, '') || '-' || NVL(TO_CHAR(dx.NUMERO_DOCUMENTO), '')) LIKE UPPER(:search))
      `
      : '';

    const searchBind = params.search
      ? { search: `%${params.search}%` }
      : {};

    const dataResult = await conn.execute<MoraRow>(
      `${SELECT_BASE}
       ${whereClause}
       ORDER BY ID_MORA DESC
       OFFSET :offset ROWS
       FETCH NEXT :limit ROWS ONLY`,
      {
        ...searchBind,
        offset,
        limit: params.limit,
      },
    );

    const countResult = await conn.execute<{
      TOTAL: number;
    }>(
      `SELECT COUNT(*) AS TOTAL
       FROM CXC_MORA
       ${whereClause}`,
      searchBind,
    );

    return {
      data: (dataResult.rows ?? []).map(mapRow),
      total: countResult.rows?.[0]?.TOTAL ?? 0,
    };
  } finally {
    await conn.close();
  }
}

export async function findById(
  id: number,
): Promise<Mora | null> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<MoraRow>(
      `${SELECT_BASE}
       WHERE ID_MORA = :id`,
      { id },
    );

    const row = result.rows?.[0];

    return row ? mapRow(row) : null;
  } finally {
    await conn.close();
  }
}




// =====================================================
// MORA ESCALONADA, SEGMENTOS Y NOTAS DE DÉBITO POR MORA
// =====================================================
//
// Todo sale de la base:
// - CXC_TRAMOS_MORA: % según los días de mora (contados después de la gracia).
// - CXC_SEGMENTOS_CLIENTE / CXC_CLIENTE_SEGMENTO: puntos que se restan al tramo.
// - Tipo de documento con ES_MORA = 'S': la nota de débito con la que se cobra.
//
// Recargo de un documento = saldo × (tramo − reducción del segmento) / 100.
// Lo ya cobrado son sus notas de débito (ID_DOCUMENTO_ORIGEN), incluso anuladas; si el
// recargo supera lo cobrado, se emite otra nota solo por la diferencia.

interface Tramo {
  DIAS_DESDE: number;
  PORCENTAJE: number;
}

async function leerTramos(conn: oracledb.Connection): Promise<Tramo[]> {
  const result = await conn.execute<Tramo>(
    `SELECT DIAS_DESDE, PORCENTAJE FROM CXC_TRAMOS_MORA WHERE TRIM(ESTADO) = 'A' ORDER BY DIAS_DESDE`,
  );
  return (result.rows ?? []).map((t) => ({ DIAS_DESDE: Number(t.DIAS_DESDE), PORCENTAJE: Number(t.PORCENTAJE) }));
}

/** % del tramo que corresponde a esos días de mora (0 si aún no hay mora). */
export function porcentajeDeTramo(tramos: Tramo[], diasMora: number): number {
  let porcentaje = 0;
  for (const tramo of tramos) {
    if (diasMora >= tramo.DIAS_DESDE) porcentaje = tramo.PORCENTAJE;
  }
  return porcentaje;
}

interface CarteraRow {
  ID_DOCUMENTO: number; ID_CLIENTE: number; CODIGO_CLIENTE: string; CLIENTE: string; DOCUMENTO: string;
  ID_MONEDA: number; MONEDA: string | null; NIT_CLIENTE: string | null;
  FECHA_DOCUMENTO: string; FECHA_VENCIMIENTO: string; FECHA_INICIO_MORA: string;
  DIAS_GRACIA: number; DIAS_VENCIDO: number; SALDO: number;
  SEGMENTO: string | null; REDUCCION_MORA: number; EMITIDO: number;
}

// Documentos de cargo con saldo. Las notas de débito por mora no generan mora.
const SELECT_CARTERA = `
  SELECT d.ID_DOCUMENTO, d.ID_CLIENTE,
         'CR-' || LPAD(d.ID_CLIENTE, 5, '0') AS CODIGO_CLIENTE,
         c.NOMBRE AS CLIENTE,
         NVL(t.NOMBRE, 'Documento') || ' ' || TRIM(BOTH '-' FROM d.SERIE || '-' || d.NUMERO_DOCUMENTO) AS DOCUMENTO,
         d.ID_MONEDA, m.CODIGO AS MONEDA, d.NIT_CLIENTE,
         TO_CHAR(d.FECHA_DOCUMENTO, 'YYYY-MM-DD') AS FECHA_DOCUMENTO,
         TO_CHAR(d.FECHA_VENCIMIENTO, 'YYYY-MM-DD') AS FECHA_VENCIMIENTO,
         TO_CHAR(d.FECHA_VENCIMIENTO + NVL(cc.DIAS_GRACIA, 0), 'YYYY-MM-DD') AS FECHA_INICIO_MORA,
         NVL(cc.DIAS_GRACIA, 0) AS DIAS_GRACIA,
         TO_DATE(:hoy, 'YYYY-MM-DD') - TRUNC(d.FECHA_VENCIMIENTO) AS DIAS_VENCIDO,
         d.SALDO,
         sg.CODIGO AS SEGMENTO,
         NVL(sg.REDUCCION_MORA, 0) AS REDUCCION_MORA,
         -- Incluye notas anuladas: anular una nota es perdonar ese recargo, no volver a cobrarlo.
         NVL((SELECT SUM(nd.TOTAL) FROM CXC_DOCUMENTOS nd
               WHERE nd.ID_DOCUMENTO_ORIGEN = d.ID_DOCUMENTO), 0) AS EMITIDO
    FROM CXC_DOCUMENTOS d
    JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
    LEFT JOIN CXC_TIPOS_DOCUMENTO t ON t.ID_TIPO_DOCUMENTO = d.ID_TIPO_DOCUMENTO
    LEFT JOIN MONEDA m ON m.ID_MONEDA = d.ID_MONEDA
    -- Una condición inactiva sigue rigiendo los documentos que ya se emitieron con ella.
    LEFT JOIN CXC_CONDICIONES_CREDITO cc ON cc.ID_CONDICION = NVL(d.ID_CONDICION_CREDITO, c.ID_CONDICION)
    LEFT JOIN CXC_CLIENTE_SEGMENTO cs ON cs.ID_CLIENTE = d.ID_CLIENTE
    LEFT JOIN CXC_SEGMENTOS_CLIENTE sg ON sg.ID_SEGMENTO = cs.ID_SEGMENTO AND TRIM(sg.ESTADO) = 'A'
   WHERE d.SALDO > 0.005
     AND d.FECHA_VENCIMIENTO IS NOT NULL
     AND UPPER(TRIM(d.ESTADO)) NOT IN ('PAGADO', 'PAGADA', 'ANULADO', 'ANULADA')
     AND NVL(t.NATURALEZA, 'CARGO') = 'CARGO'
     AND NVL(t.ES_MORA, 'N') = 'N'
     AND d.ID_DOCUMENTO_ORIGEN IS NULL`;

function calcular(r: CarteraRow, tramos: Tramo[]): CarteraMoraDocumento {
  const diasVencido = Number(r.DIAS_VENCIDO);
  const diasGracia = Number(r.DIAS_GRACIA);
  const diasMora = Math.max(0, diasVencido - diasGracia);
  const saldo = roundMoney(Number(r.SALDO));
  const porcentajeTramo = porcentajeDeTramo(tramos, diasMora);
  const reduccionMora = Number(r.REDUCCION_MORA);
  const porcentajeMora = diasMora > 0 ? Math.max(0, roundMoney(porcentajeTramo - reduccionMora)) : 0;
  const montoMora = diasMora > 0 ? roundMoney((saldo * porcentajeMora) / 100) : 0;
  const montoEmitido = roundMoney(Number(r.EMITIDO));
  const estado: EstadoCarteraMora = diasMora > 0 ? 'EN_MORA'
    : diasVencido > 0 ? 'EN_GRACIA'
      : -diasVencido <= DIAS_PROXIMOS_A_VENCER ? 'POR_VENCER'
        : 'AL_DIA';
  return {
    idDocumento: r.ID_DOCUMENTO,
    idCliente: r.ID_CLIENTE,
    codigoCliente: r.CODIGO_CLIENTE,
    cliente: r.CLIENTE,
    documento: r.DOCUMENTO,
    moneda: r.MONEDA ?? 'GTQ',
    fechaDocumento: r.FECHA_DOCUMENTO,
    fechaVencimiento: r.FECHA_VENCIMIENTO,
    fechaInicioMora: r.FECHA_INICIO_MORA,
    diasGracia,
    diasVencido,
    diasMora,
    saldo,
    segmento: r.SEGMENTO,
    porcentajeTramo,
    reduccionMora,
    porcentajeMora,
    montoMora,
    montoEmitido,
    montoPorEmitir: Math.max(0, roundMoney(montoMora - montoEmitido)),
    estado,
  };
}

/**
 * Toda la cartera pendiente con su mora calculada al día `hoy` (YYYY-MM-DD),
 * ordenada por días vencidos de mayor a menor.
 */
export async function findCartera(hoy: string): Promise<CarteraMoraDocumento[]> {
  const conn = await getConnection();
  try {
    const tramos = await leerTramos(conn);
    const result = await conn.execute<CarteraRow>(
      `${SELECT_CARTERA} ORDER BY DIAS_VENCIDO DESC, d.SALDO DESC`,
      { hoy },
    );
    return (result.rows ?? []).map((r) => calcular(r, tramos));
  } finally {
    await conn.close();
  }
}

/** Mora de un cliente para el aviso en Pagos: lo que debe en notas de débito y su mayor atraso. */
export async function resumenCliente(idCliente: number, hoy: string): Promise<ResumenMoraCliente> {
  const conn = await getConnection();
  try {
    const tramos = await leerTramos(conn);
    const cartera = await conn.execute<CarteraRow>(
      `${SELECT_CARTERA} AND d.ID_CLIENTE = :idCliente`,
      { hoy, idCliente },
    );
    const enMora = (cartera.rows ?? []).map((r) => calcular(r, tramos)).filter((d) => d.estado === 'EN_MORA');
    const notas = await conn.execute<{ TOTAL: number; CANTIDAD: number }>(
      `SELECT NVL(SUM(d.SALDO), 0) AS TOTAL, COUNT(*) AS CANTIDAD
         FROM CXC_DOCUMENTOS d
        WHERE d.ID_CLIENTE = :idCliente
          AND d.ID_DOCUMENTO_ORIGEN IS NOT NULL
          AND d.SALDO > 0.005
          AND UPPER(TRIM(d.ESTADO)) NOT IN ('PAGADO', 'PAGADA', 'ANULADO', 'ANULADA')`,
      { idCliente },
    );
    return {
      idCliente,
      documentosEnMora: enMora.length,
      diasMaxMora: enMora.reduce((max, d) => Math.max(max, d.diasMora), 0),
      notasPendientes: Number(notas.rows?.[0]?.CANTIDAD ?? 0),
      moraPendiente: roundMoney(Number(notas.rows?.[0]?.TOTAL ?? 0)),
      moraPorEmitir: roundMoney(enMora.reduce((s, d) => s + d.montoPorEmitir, 0)),
    };
  } finally {
    await conn.close();
  }
}

export interface ResultadoRecalculoMora {
  activas: number;
  cerradas: number;
  notasEmitidas: number;
  montoEmitido: number;
}

/**
 * Emite la nota de débito por mora de un documento, sin commit. Número
 * automático en la serie del tipo de mora; vence el mismo día (es exigible ya).
 */
async function emitirNotaMora(
  conn: oracledb.Connection,
  idTipoMora: number,
  origen: CarteraRow,
  monto: number,
  hoy: string,
): Promise<void> {
  const { serie, numero } = await siguienteNumeroDocumento(conn, idTipoMora);
  await conn.execute(
    `INSERT INTO CXC_DOCUMENTOS
       (ID_CLIENTE, NIT_CLIENTE, ID_TIPO_DOCUMENTO, ID_MONEDA, ID_CONDICION_CREDITO, ESTADO,
        SERIE, NUMERO_DOCUMENTO, FECHA_DOCUMENTO, FECHA_VENCIMIENTO, TOTAL, SALDO, ID_DOCUMENTO_ORIGEN)
     VALUES
       (:idCliente, :nitCliente, :idTipo, :idMoneda, NULL, 'PENDIENTE',
        :serie, :numero, TO_DATE(:hoy, 'YYYY-MM-DD'), TO_DATE(:hoy, 'YYYY-MM-DD'), :monto, :monto, :idOrigen)`,
    {
      idCliente: origen.ID_CLIENTE,
      nitCliente: origen.NIT_CLIENTE,
      idTipo: idTipoMora,
      idMoneda: origen.ID_MONEDA,
      serie,
      numero,
      hoy,
      monto,
      idOrigen: origen.ID_DOCUMENTO,
    },
  );
}

/**
 * Recalcula y cobra la mora de toda la cartera en una transacción: guarda el
 * cálculo del día en CXC_MORA y emite las notas de débito que falten. La usan el
 * botón "Guardar cálculo de mora" y la tarea diaria.
 *
 * - Cada documento se bloquea antes de sumar lo ya cobrado: dos recálculos
 *   simultáneos no pueden emitir la misma diferencia dos veces.
 * - Una mora ACTIVA cuyo documento ya no tiene saldo se cierra como PAGADA.
 */
export async function recalcularPendientes(hoy: string = businessTodayIso()): Promise<ResultadoRecalculoMora> {
  const conn = await getConnection();
  try {
    const tipoMora = await conn.execute<{ ID_TIPO_DOCUMENTO: number }>(
      `SELECT ID_TIPO_DOCUMENTO FROM CXC_TIPOS_DOCUMENTO
        WHERE ES_MORA = 'S' AND TRIM(ESTADO) = 'A'
        ORDER BY ID_TIPO_DOCUMENTO FETCH FIRST 1 ROWS ONLY`,
    );
    const idTipoMora = tipoMora.rows?.[0]?.ID_TIPO_DOCUMENTO;
    if (!idTipoMora) {
      throw new BadRequestError('No hay un tipo de documento activo marcado como nota de débito por mora (ES_MORA = S). Solicita al equipo DBA que lo registre.');
    }

    const cerradasResult = await conn.execute(
      `UPDATE CXC_MORA m
          SET ESTADO = 'PAGADA'
        WHERE UPPER(m.ESTADO) = 'ACTIVA'
          AND EXISTS (
            SELECT 1 FROM CXC_DOCUMENTOS d
             WHERE d.ID_DOCUMENTO = m.ID_DOCUMENTO
               AND d.SALDO <= 0.005
          )`,
    );

    const tramos = await leerTramos(conn);
    const candidatos = await conn.execute<CarteraRow>(`${SELECT_CARTERA} ORDER BY d.ID_DOCUMENTO`, { hoy });

    let activas = 0;
    let notasEmitidas = 0;
    let montoEmitido = 0;

    for (const row of candidatos.rows ?? []) {
      const doc = calcular(row, tramos);
      if (doc.estado !== 'EN_MORA') continue;

      // Bloquea el documento y vuelve a sumar lo cobrado con datos frescos.
      await conn.execute(`SELECT ID_DOCUMENTO FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :id FOR UPDATE`, { id: doc.idDocumento });
      const cobrado = await conn.execute<{ TOTAL: number }>(
        `SELECT NVL(SUM(TOTAL), 0) AS TOTAL FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO_ORIGEN = :id`,
        { id: doc.idDocumento },
      );
      const porEmitir = roundMoney(doc.montoMora - Number(cobrado.rows?.[0]?.TOTAL ?? 0));

      const existente = await conn.execute<{ ID_MORA: number }>(
        `SELECT ID_MORA FROM CXC_MORA
          WHERE ID_DOCUMENTO = :idDocumento AND UPPER(ESTADO) = 'ACTIVA'
          FOR UPDATE`,
        { idDocumento: doc.idDocumento },
      );
      const moraExistente = existente.rows?.[0];
      const datos = {
        diasMora: doc.diasMora, saldo: doc.saldo, porcentaje: doc.porcentajeMora, montoMora: doc.montoMora, hoy,
      };

      if (moraExistente) {
        await conn.execute(
          `UPDATE CXC_MORA
              SET DIAS_MORA = :diasMora, SALDO_VENCIDO = :saldo,
                  PORCENTAJE_MORA = :porcentaje, MONTO_MORA = :montoMora,
                  FECHA_CALCULO = TO_DATE(:hoy, 'YYYY-MM-DD')
            WHERE ID_MORA = :idMora`,
          { ...datos, idMora: moraExistente.ID_MORA },
        );
      } else {
        await conn.execute(
          `INSERT INTO CXC_MORA
             (ID_DOCUMENTO, DIAS_MORA, SALDO_VENCIDO, PORCENTAJE_MORA, MONTO_MORA, FECHA_CALCULO, ESTADO)
           VALUES
             (:idDocumento, :diasMora, :saldo, :porcentaje, :montoMora, TO_DATE(:hoy, 'YYYY-MM-DD'), 'ACTIVA')`,
          { ...datos, idDocumento: doc.idDocumento },
        );
      }
      activas += 1;

      if (porEmitir > 0.005) {
        await emitirNotaMora(conn, idTipoMora, row, porEmitir, hoy);
        notasEmitidas += 1;
        montoEmitido = roundMoney(montoEmitido + porEmitir);
      }
    }

    await conn.commit();
    return { activas, cerradas: cerradasResult.rowsAffected ?? 0, notasEmitidas, montoEmitido };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}
