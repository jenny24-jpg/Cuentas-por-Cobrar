import oracledb from 'oracledb';
import { getConnection } from '../../../../config/database';
import {
  DIAS_PROXIMOS_A_VENCER,
  type CarteraMoraDocumento,
  type EstadoCarteraMora,
  type Mora,
  type CreateMoraInput,
  type UpdateMoraInput,
} from '@erp/contracts';
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

export async function create(
  input: CreateMoraInput,
): Promise<number> {
  const conn = await getConnection();

  try {
    const result = await conn.execute<{
      id: number[];
    }>(
      `INSERT INTO CXC_MORA
        (
          ID_DOCUMENTO,
          DIAS_MORA,
          SALDO_VENCIDO,
          PORCENTAJE_MORA,
          MONTO_MORA,
          FECHA_CALCULO,
          ESTADO
        )
       VALUES
        (
          :idDocumento,
          :diasMora,
          :saldoVencido,
          :porcentajeMora,
          :montoMora,
          CASE
            WHEN :fechaCalculo IS NULL THEN NULL
            ELSE TO_DATE(:fechaCalculo, 'YYYY-MM-DD')
          END,
          :estado
        )
       RETURNING ID_MORA INTO :id`,
      {
        idDocumento: input.idDocumento,
        diasMora: input.diasMora ?? null,
        saldoVencido: input.saldoVencido ?? null,
        porcentajeMora: input.porcentajeMora ?? null,
        montoMora: input.montoMora ?? null,
        fechaCalculo: input.fechaCalculo ?? null,
        estado: input.estado,
        id: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
      },
    );

    await conn.commit();

    return result.outBinds!.id[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function update(
  id: number,
  input: UpdateMoraInput,
): Promise<void> {
  const fields: string[] = [];
  const binds: Record<string, any> = { id };

  if (input.idDocumento !== undefined) {
    fields.push('ID_DOCUMENTO = :idDocumento');
    binds.idDocumento = input.idDocumento;
  }

  if (input.diasMora !== undefined) {
    fields.push('DIAS_MORA = :diasMora');
    binds.diasMora = input.diasMora ?? null;
  }

  if (input.saldoVencido !== undefined) {
    fields.push('SALDO_VENCIDO = :saldoVencido');
    binds.saldoVencido = input.saldoVencido ?? null;
  }

  if (input.porcentajeMora !== undefined) {
    fields.push('PORCENTAJE_MORA = :porcentajeMora');
    binds.porcentajeMora = input.porcentajeMora ?? null;
  }

  if (input.montoMora !== undefined) {
    fields.push('MONTO_MORA = :montoMora');
    binds.montoMora = input.montoMora ?? null;
  }

  if (input.fechaCalculo !== undefined) {
    fields.push(`
      FECHA_CALCULO =
        CASE
          WHEN :fechaCalculo IS NULL THEN NULL
          ELSE TO_DATE(:fechaCalculo, 'YYYY-MM-DD')
        END
    `);

    binds.fechaCalculo = input.fechaCalculo ?? null;
  }

  if (input.estado !== undefined) {
    fields.push('ESTADO = :estado');
    binds.estado = input.estado;
  }

  if (fields.length === 0) return;

  const conn = await getConnection();

  try {
    await conn.execute(
      `UPDATE CXC_MORA
       SET ${fields.join(', ')}
       WHERE ID_MORA = :id`,
      binds,
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

export async function remove(
  id: number,
): Promise<void> {
  const conn = await getConnection();

  try {
    await conn.execute(
      `DELETE FROM CXC_MORA
       WHERE ID_MORA = :id`,
      { id },
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

/**
 * Toda la cartera pendiente con su mora calculada al día `hoy` (YYYY-MM-DD). Solo
 * documentos de cargo con saldo; la condición es la del documento o, si no tiene,
 * la del cliente. Ordenado por días vencidos de mayor a menor.
 */
export async function findCartera(hoy: string): Promise<CarteraMoraDocumento[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{
      ID_DOCUMENTO: number; ID_CLIENTE: number; CODIGO_CLIENTE: string; CLIENTE: string; DOCUMENTO: string;
      MONEDA: string | null; FECHA_DOCUMENTO: string; FECHA_VENCIMIENTO: string; FECHA_INICIO_MORA: string;
      DIAS_GRACIA: number; DIAS_VENCIDO: number; SALDO: number; PORCENTAJE_MORA: number;
    }>(
      `SELECT d.ID_DOCUMENTO, d.ID_CLIENTE,
              'CR-' || LPAD(d.ID_CLIENTE, 5, '0') AS CODIGO_CLIENTE,
              c.NOMBRE AS CLIENTE,
              NVL(t.NOMBRE, 'Documento') || ' ' || TRIM(BOTH '-' FROM d.SERIE || '-' || d.NUMERO_DOCUMENTO) AS DOCUMENTO,
              m.CODIGO AS MONEDA,
              TO_CHAR(d.FECHA_DOCUMENTO, 'YYYY-MM-DD') AS FECHA_DOCUMENTO,
              TO_CHAR(d.FECHA_VENCIMIENTO, 'YYYY-MM-DD') AS FECHA_VENCIMIENTO,
              TO_CHAR(d.FECHA_VENCIMIENTO + NVL(cc.DIAS_GRACIA, 0), 'YYYY-MM-DD') AS FECHA_INICIO_MORA,
              NVL(cc.DIAS_GRACIA, 0) AS DIAS_GRACIA,
              TO_DATE(:hoy, 'YYYY-MM-DD') - TRUNC(d.FECHA_VENCIMIENTO) AS DIAS_VENCIDO,
              d.SALDO,
              NVL(cc.PORCENTAJE_MORA, 0) AS PORCENTAJE_MORA
         FROM CXC_DOCUMENTOS d
         JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
         LEFT JOIN CXC_TIPOS_DOCUMENTO t ON t.ID_TIPO_DOCUMENTO = d.ID_TIPO_DOCUMENTO
         LEFT JOIN MONEDA m ON m.ID_MONEDA = d.ID_MONEDA
         LEFT JOIN CXC_CONDICIONES_CREDITO cc ON cc.ID_CONDICION = NVL(d.ID_CONDICION_CREDITO, c.ID_CONDICION)
        WHERE d.SALDO > 0.005
          AND d.FECHA_VENCIMIENTO IS NOT NULL
          AND UPPER(TRIM(d.ESTADO)) NOT IN ('PAGADO', 'PAGADA', 'ANULADO', 'ANULADA')
          AND NVL(t.NATURALEZA, 'CARGO') = 'CARGO'
        ORDER BY DIAS_VENCIDO DESC, d.SALDO DESC`,
      { hoy },
    );
    return (result.rows ?? []).map((r) => {
      const diasVencido = Number(r.DIAS_VENCIDO);
      const diasGracia = Number(r.DIAS_GRACIA);
      const diasMora = Math.max(0, diasVencido - diasGracia);
      const saldo = roundMoney(Number(r.SALDO));
      const porcentajeMora = Number(r.PORCENTAJE_MORA);
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
        porcentajeMora,
        montoMora: diasMora > 0 ? roundMoney((saldo * porcentajeMora) / 100) : 0,
        estado,
      };
    });
  } finally {
    await conn.close();
  }
}

export interface ResultadoRecalculoMora {
  activas: number;
  cerradas: number;
}

/**
 * Recalcula la mora de todos los documentos con una CXC_CONDICIONES_CREDITO
 * asignada. Es una acción manual (botón "Recalcular mora"), no un job
 * programado: este proyecto no usa PL/SQL ni tiene infraestructura de cron,
 * así que el disparo es explícito por diseño, no una limitación olvidada.
 *
 * Reglas:
 * - La condición es la del documento (ID_CONDICION_CREDITO) o, si no tiene,
 *   la del cliente (CLIENTE.ID_CONDICION).
 * - Días de mora = (hoy - fechaVencimiento) - diasGracia de su condición.
 *   Si el resultado es <= 0, todavía está dentro del período de gracia: no
 *   se genera/actualiza mora para ese documento en esta pasada.
 * - Monto de mora = saldo actual del documento * porcentajeMora / 100 (plano,
 *   no prorrateado por día — igual de simple que el resto de porcentajes del
 *   sistema, ej. condición de crédito o ajustes).
 * - Si el documento ya tiene una mora ACTIVA, se actualiza in-place; si no,
 *   se crea una nueva.
 * - Una mora ACTIVA cuyo documento ya no tiene saldo pendiente se cierra
 *   como PAGADA.
 */
export async function recalcularPendientes(hoy: string = businessTodayIso()): Promise<ResultadoRecalculoMora> {
  const conn = await getConnection();
  try {
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

    const candidatos = await conn.execute<{
      ID_DOCUMENTO: number;
      SALDO: number;
      DIAS_VENCIDO: number;
      DIAS_GRACIA: number;
      PORCENTAJE_MORA: number;
    }>(
      // Misma regla y misma fecha de negocio que findCartera: condición del documento
      // o, si no tiene, la del cliente; días contados en Oracle sobre fechas truncadas.
      `SELECT d.ID_DOCUMENTO, d.SALDO,
              TO_DATE(:hoy, 'YYYY-MM-DD') - TRUNC(d.FECHA_VENCIMIENTO) AS DIAS_VENCIDO,
              cc.DIAS_GRACIA, cc.PORCENTAJE_MORA
         FROM CXC_DOCUMENTOS d
         JOIN CLIENTE c ON c.ID_CLIENTE = d.ID_CLIENTE
         JOIN CXC_CONDICIONES_CREDITO cc ON cc.ID_CONDICION = NVL(d.ID_CONDICION_CREDITO, c.ID_CONDICION)
         LEFT JOIN CXC_TIPOS_DOCUMENTO t ON t.ID_TIPO_DOCUMENTO = d.ID_TIPO_DOCUMENTO
        WHERE UPPER(cc.ESTADO) = 'A'
          AND NVL(t.NATURALEZA, 'CARGO') = 'CARGO'
          AND d.SALDO > 0.005
          AND d.FECHA_VENCIMIENTO IS NOT NULL
          AND UPPER(d.ESTADO) NOT IN ('PAGADO', 'PAGADA', 'ANULADO', 'ANULADA')`,
      { hoy },
    );

    let activas = 0;

    for (const row of candidatos.rows ?? []) {
      const diasMora = Number(row.DIAS_VENCIDO) - Number(row.DIAS_GRACIA);
      if (diasMora <= 0) continue; // todavía dentro del período de gracia

      const saldo = roundMoney(Number(row.SALDO));
      const montoMora = roundMoney((saldo * Number(row.PORCENTAJE_MORA)) / 100);

      const existente = await conn.execute<{ ID_MORA: number }>(
        `SELECT ID_MORA FROM CXC_MORA
          WHERE ID_DOCUMENTO = :idDocumento AND UPPER(ESTADO) = 'ACTIVA'
          FOR UPDATE`,
        { idDocumento: row.ID_DOCUMENTO },
      );
      const moraExistente = existente.rows?.[0];

      if (moraExistente) {
        await conn.execute(
          `UPDATE CXC_MORA
              SET DIAS_MORA = :diasMora, SALDO_VENCIDO = :saldo,
                  PORCENTAJE_MORA = :porcentaje, MONTO_MORA = :montoMora,
                  FECHA_CALCULO = TO_DATE(:hoy, 'YYYY-MM-DD')
            WHERE ID_MORA = :idMora`,
          { diasMora, saldo, porcentaje: row.PORCENTAJE_MORA, montoMora, hoy, idMora: moraExistente.ID_MORA },
        );
      } else {
        await conn.execute(
          `INSERT INTO CXC_MORA
             (ID_DOCUMENTO, DIAS_MORA, SALDO_VENCIDO, PORCENTAJE_MORA, MONTO_MORA, FECHA_CALCULO, ESTADO)
           VALUES
             (:idDocumento, :diasMora, :saldo, :porcentaje, :montoMora, TO_DATE(:hoy, 'YYYY-MM-DD'), 'ACTIVA')`,
          { idDocumento: row.ID_DOCUMENTO, diasMora, saldo, porcentaje: row.PORCENTAJE_MORA, montoMora, hoy },
        );
      }
      activas += 1;
    }

    await conn.commit();
    return { activas, cerradas: cerradasResult.rowsAffected ?? 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}