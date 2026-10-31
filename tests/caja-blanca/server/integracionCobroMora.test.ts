import { describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as pagos from '../../../server/src/modules/cxc/repositories/pagos/pago.repository';
import * as documentos from '../../../server/src/modules/cxc/repositories/documentos/documento.repository';
import * as mora from '../../../server/src/modules/cxc/repositories/credito/mora.repository';
import { cobrarRutaSchema } from '../../../packages/contracts/src';

// ---------------------------------------------------------------------------
// Cobro en ruta: o el cobrador recibe el dinero (forma de pago) o se usa un pago ya registrado.
// ---------------------------------------------------------------------------
describe('cobrarRutaSchema — una sola forma de cobro', () => {
  const base = { idAsignacion: 1, idEmpleado: 2, monto: 100, fecha: '2026-10-27', claveOperacion: '3f1c1b9e-4b8a-4c1e-9a55-0f1f2b3c4d5e' };
  it('acepta pago nuevo con forma de pago', () => expect(cobrarRutaSchema.safeParse({ ...base, idFormaPago: 1 }).success).toBe(true));
  it('acepta pago ya registrado', () => expect(cobrarRutaSchema.safeParse({ ...base, idPago: 9 }).success).toBe(true));
  it('rechaza ambos o ninguno', () => {
    expect(cobrarRutaSchema.safeParse({ ...base, idPago: 9, idFormaPago: 1 }).success).toBe(false);
    expect(cobrarRutaSchema.safeParse(base).success).toBe(false);
  });
});

describe('pago.cobrarEnRuta', () => {
  const datos = { idRutaDetalle: 5, idDocumento: 7, idFormaPago: 1, monto: 100, fecha: '2026-10-27', idEmpleado: 2, claveRuta: 'k-1' };

  it('reintento con la misma clave devuelve la aplicación previa sin registrar otro pago', async () => {
    const { conn, ejecuto } = crearConexion([
      { sql: /SELECT ID_APLICACION FROM CXC_APLICACION_PAGOS WHERE CLAVE_RUTA/, rows: [{ ID_APLICACION: 77 }] },
    ]);
    db.getConnection.mockResolvedValue(conn);
    await expect(pagos.cobrarEnRuta(datos)).resolves.toBe(77);
    expect(ejecuto(/INSERT INTO CXC_PAGOS/)).toHaveLength(0);
  });

  it('documento inexistente: no registra el pago y revierte', async () => {
    const { conn, ejecuto } = crearConexion([]);
    db.getConnection.mockResolvedValue(conn);
    await expect(pagos.cobrarEnRuta(datos)).rejects.toThrow(/no existe/);
    expect(ejecuto(/INSERT INTO CXC_PAGOS/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('bloquea la ruta antes de numerar e insertar el pago con el cliente y moneda del documento', async () => {
    const { conn, ejecuciones } = crearConexion([
      { sql: /SELECT ID_CLIENTE, ID_MONEDA FROM CXC_DOCUMENTOS/, rows: [{ ID_CLIENTE: 10, ID_MONEDA: 1 }] },
      { sql: /INSERT INTO CXC_PAGOS/, outId: 300 },
    ]);
    db.getConnection.mockResolvedValue(conn);
    // La aplicación en sí ya está cubierta por las pruebas de aplicacionPago; aquí basta el orden.
    await pagos.cobrarEnRuta(datos).catch(() => undefined);
    const sqls = ejecuciones.map((e) => e.sql);
    const ruta = sqls.findIndex((s) => /FROM CXC_RUTAS r/.test(s));
    const insert = sqls.findIndex((s) => /INSERT INTO CXC_PAGOS/.test(s));
    expect(ruta).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(ruta);
    expect(ejecuciones[insert].binds).toMatchObject({ idCliente: 10, idMoneda: 1, monto: 100, fecha: '2026-10-27' });
  });
});

// ---------------------------------------------------------------------------
// Anular una factura anula también sus notas de débito por mora pendientes.
// ---------------------------------------------------------------------------
describe('documento.anular — notas de mora hijas', () => {
  const reglas: Regla[] = [
    { sql: /SELECT ESTADO, SALDO FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :id FOR UPDATE/, rows: [{ ESTADO: 'VENCIDO', SALDO: 500 }] },
    { sql: /WHERE ID_DOCUMENTO_ORIGEN = :id/, rows: [{ ID_DOCUMENTO: 90, ESTADO: 'PENDIENTE', SALDO: 25 }] },
  ];
  const input = { idEmpleadoAnulacion: 3, fechaAnulacion: '2026-10-27', motivoAnulacion: 'Error de emisión' };

  it('anula la factura y su nota pendiente en la misma transacción', async () => {
    const { conn, ejecuto } = crearConexion(reglas);
    db.getConnection.mockResolvedValue(conn);
    await documentos.anular(1, input as Parameters<typeof documentos.anular>[1]);
    const hijas = ejecuto(/WHERE ID_DOCUMENTO_ORIGEN = :id/)[0];
    expect(hijas.sql).toMatch(/NOT IN \('PAGADO', 'PAGADA', 'ANULADO', 'ANULADA'\)/);
    const nota = ejecuto(/WHERE ID_DOCUMENTO = :idNota/)[0];
    expect(nota.binds).toMatchObject({ idNota: 90, idEmpleadoAnulacion: 3 });
    expect(String(nota.binds.motivo)).toMatch(/factura de origen/);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Un convenio ACTIVO suspende la mora del documento.
// ---------------------------------------------------------------------------
describe('mora.findCartera — documentos en convenio', () => {
  const fila = (extra: Record<string, unknown>) => ({
    ID_DOCUMENTO: 1, ID_CLIENTE: 10, CODIGO_CLIENTE: 'CR-00010', CLIENTE: 'X', DOCUMENTO: 'Factura A-1',
    ID_MONEDA: 1, MONEDA: 'GTQ', NIT_CLIENTE: null, FECHA_DOCUMENTO: '2026-08-01', FECHA_VENCIMIENTO: '2026-09-01',
    FECHA_INICIO_MORA: '2026-09-01', DIAS_GRACIA: 0, DIAS_VENCIDO: 50, SALDO: 1000,
    SEGMENTO: null, REDUCCION_MORA: 0, EMITIDO: 0, EN_CONVENIO: 0, ...extra,
  });
  const reglas = (row: Record<string, unknown>): Regla[] => [
    { sql: /FROM CXC_TRAMOS_MORA/, rows: [{ DIAS_DESDE: 1, PORCENTAJE: 5 }, { DIAS_DESDE: 41, PORCENTAJE: 10 }] },
    { sql: /FROM CXC_DOCUMENTOS d/, rows: [row] },
  ];

  it('sin convenio corre la mora', async () => {
    const { conn } = crearConexion(reglas(fila({})));
    db.getConnection.mockResolvedValue(conn);
    const [doc] = await mora.findCartera('2026-10-21');
    expect(doc).toMatchObject({ estado: 'EN_MORA', porcentajeMora: 10, montoMora: 100 });
  });

  it('con convenio activo no hay mora ni nada por emitir', async () => {
    const { conn, ejecuciones } = crearConexion(reglas(fila({ EN_CONVENIO: 1 })));
    db.getConnection.mockResolvedValue(conn);
    const [doc] = await mora.findCartera('2026-10-21');
    expect(doc).toMatchObject({ estado: 'EN_CONVENIO', diasMora: 0, montoMora: 0, montoPorEmitir: 0 });
    expect(ejecuciones.some((e) => /CXC_CONVENIOS_PAGO cv .*'ACTIVO'/.test(e.sql))).toBe(true);
  });
});
