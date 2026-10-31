import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as aplicaciones from '../../../server/src/modules/cxc/repositories/credito/aplicacionNotaCredito.repository';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Una nota de crédito solo rebaja deuda cuando un ADMIN distinto de quien la
// registró la aprueba; al aprobarla se aplica a su documento en la misma transacción.
// ---------------------------------------------------------------------------
const reglas = (nota: Record<string, unknown> = {}, saldo = 100): Regla[] => [
  {
    sql: /SELECT ESTADO, ID_DOCUMENTO_REFERENCIA, MONTO, ID_EMPLEADO_REGISTRO, ID_EMPLEADO_APROBACION FROM CXC_NOTAS_CREDITO/,
    rows: [{ ESTADO: 'PENDIENTE', ID_DOCUMENTO_REFERENCIA: 9, MONTO: 6, ID_EMPLEADO_REGISTRO: 1, ID_EMPLEADO_APROBACION: null, ...nota }],
  },
  // Lectura de la nota dentro de la aplicación (ya con el aprobador asignado).
  {
    sql: /ID_EMPLEADO_APROBACION, ID_DOCUMENTO_REFERENCIA, TO_CHAR\(FECHA, 'YYYY-MM-DD'\) AS FECHA_ISO FROM CXC_NOTAS_CREDITO/,
    rows: [{ ID_NOTA_CREDITO: 301, ID_CLIENTE: 5, MONTO: 6, ESTADO: 'PENDIENTE', ID_EMPLEADO_APROBACION: 2, ID_DOCUMENTO_REFERENCIA: 9, FECHA_ISO: '2026-10-28', ...nota }],
  },
  { sql: /FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :idDocumento FOR UPDATE/, rows: [{ ID_DOCUMENTO: 9, ID_CLIENTE: 5, TOTAL: 200, SALDO: saldo, ESTADO: 'PENDIENTE' }] },
  { sql: /SUM\(MONTO_APLICADO\)/, rows: [{ TOTAL: 0 }] },
  { sql: /INSERT INTO CXC_APLICACION_NOTA_CREDITO/, outId: 50 },
];

describe('aplicacionNotaCredito.aprobar', () => {
  it('registra al aprobador y aplica la nota completa a su documento, todo en una transacción', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.aprobar(301, 2)).resolves.toBe(50);
    expect(ejecuto(/SET ID_EMPLEADO_APROBACION = :idEmpleadoAprobacion/)[0].binds).toEqual({ idEmpleadoAprobacion: 2, idNotaCredito: 301 });
    expect(ejecuto(/INSERT INTO CXC_APLICACION_NOTA_CREDITO/)[0].binds).toMatchObject({ idNotaCredito: 301, idDocumento: 9, montoAplicado: 6, idEmpleado: 2 });
    expect(ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 94, idDocumento: 9 });
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('quien registró la nota no puede aprobarla', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.aprobar(301, 1)).rejects.toThrow(/Quien registró la nota de crédito no puede aprobarla/);
    expect(ejecuto(/SET ID_EMPLEADO_APROBACION/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });

  it('una nota ya aprobada no se aprueba dos veces', async () => {
    const { conn } = crearConexion(reglas({ ID_EMPLEADO_APROBACION: 3 }));
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.aprobar(301, 2)).rejects.toThrow(/ya fue aprobada/);
  });

  it('si el saldo del documento ya es menor que la nota, no queda aprobada', async () => {
    const { conn } = crearConexion(reglas({}, 4));
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.aprobar(301, 2)).rejects.toThrow(/saldo del documento/);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});

describe('aplicacionNotaCredito.create manual', () => {
  it('una nota sin aprobar no se puede aplicar', async () => {
    const { conn, ejecuto } = crearConexion(reglas({ ID_EMPLEADO_APROBACION: null }));
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.create({
      idNotaCredito: 301, idDocumento: 9, montoAplicado: 6, fechaAplicacion: '2026-10-28', idEmpleado: 2,
    } as Parameters<typeof aplicaciones.create>[0])).rejects.toThrow(/debe ser aprobada por un administrador/);
    expect(ejecuto(/INSERT INTO CXC_APLICACION_NOTA_CREDITO/)).toHaveLength(0);
  });
});

describe('una nota aprobada solo va a su factura y cualquier cambio pide aprobación otra vez', () => {
  it('no se aplica a una factura distinta a la de referencia', async () => {
    const { conn, ejecuto } = crearConexion(reglas());
    db.getConnection.mockResolvedValue(conn);
    await expect(aplicaciones.create({
      idNotaCredito: 301, idDocumento: 77, montoAplicado: 6, fechaAplicacion: '2026-10-28', idEmpleado: 2,
    } as Parameters<typeof aplicaciones.create>[0])).rejects.toThrow(/solo puede aplicarse a su factura de referencia/);
    expect(ejecuto(/INSERT INTO CXC_APLICACION_NOTA_CREDITO/)).toHaveLength(0);
  });

  it('al reversar la aplicación, la nota pierde la aprobación', async () => {
    const { conn, ejecuto } = crearConexion([
      { sql: /FROM CXC_APLICACION_NOTA_CREDITO\s+WHERE ID_APLICACION_NC = :id\s+FOR UPDATE/, rows: [{ ID_APLICACION_NC: 50, ID_NOTA_CREDITO: 301, ID_DOCUMENTO: 9, MONTO_APLICADO: 6, ESTADO: 'CONFIRMADA' }] },
      { sql: /FROM CXC_NOTAS_CREDITO\s+WHERE ID_NOTA_CREDITO = :idNotaCredito\s+FOR UPDATE/, rows: [{ ID_NOTA_CREDITO: 301, MONTO: 6, ESTADO: 'APLICADA' }] },
      { sql: /FROM CXC_DOCUMENTOS\s+WHERE ID_DOCUMENTO = :idDocumento\s+FOR UPDATE/, rows: [{ ID_DOCUMENTO: 9, TOTAL: 200, SALDO: 94, ESTADO: 'PARCIAL' }] },
      { sql: /SUM\(MONTO_APLICADO\)/, rows: [{ TOTAL: 0 }] },
    ]);
    db.getConnection.mockResolvedValue(conn);
    await aplicaciones.reversar(50, { idEmpleadoReversa: 2, motivoReversa: 'Se aplicó por error al cliente' } as Parameters<typeof aplicaciones.reversar>[1]);
    const nota = ejecuto(/UPDATE CXC_NOTAS_CREDITO/)[0];
    expect(nota.sql).toMatch(/ID_EMPLEADO_APROBACION = NULL/);
    expect(nota.sql).toMatch(/FECHA_APROBACION = NULL/);
  });
});
