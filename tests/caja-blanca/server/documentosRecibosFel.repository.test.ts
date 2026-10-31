import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as documentos from '../../../server/src/modules/cxc/repositories/documentos/documento.repository';
import * as recibos from '../../../server/src/modules/cxc/repositories/pagos/recibo.repository';
import * as fel from '../../../server/src/modules/cxc/repositories/facturacion/factura.repository';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function conexion(r: Regla[]) {
  const c = crearConexion(r);
  db.getConnection.mockResolvedValue(c.conn);
  return c;
}

// ---------------------------------------------------------------------------
describe('documento.repository — escritura', () => {
  const nuevo = { idCliente: 1, idTipoDocumento: 81, idMoneda: 1, idCondicionCredito: 3, fechaDocumento: HOY, fechaVencimiento: '2026-11-26', total: 300, nitCliente: '1234567-9' };

  it('create: numera con bloqueo del tipo y nace PENDIENTE con saldo = total', async () => {
    const { conn, ejecuto } = conexion([
      { sql: /SELECT CODIGO FROM CXC_TIPOS_DOCUMENTO/, rows: [{ CODIGO: 'FAC' }] },
      { sql: /MAX/, rows: [{ ULTIMO: 9 }] },
      { sql: /INSERT INTO CXC_DOCUMENTOS/, outId: 140 },
    ]);
    await expect(documentos.create(nuevo)).resolves.toBe(140);
    const ins = ejecuto(/INSERT INTO CXC_DOCUMENTOS/)[0];
    expect(ins.binds).toMatchObject({ serie: 'FAC', numeroDocumento: '00000010', total: 300 });
    expect(ins.sql).toMatch(/'PENDIENTE'.*:total, :total/);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('create: tipo inexistente revierte', async () => {
    const { conn } = conexion([]);
    await expect(documentos.create(nuevo)).rejects.toThrow(/no encontrado/);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
  it('update: solo los campos enviados; sin campos no abre conexión', async () => {
    await documentos.update(5, {});
    expect(db.getConnection).not.toHaveBeenCalled();
    const { ejecuto } = conexion([]);
    await documentos.update(5, { total: 450, saldo: 450, estado: 'PENDIENTE', fechaVencimiento: '2026-12-01', idCondicionCredito: null });
    const upd = ejecuto(/UPDATE CXC_DOCUMENTOS/)[0];
    expect(upd.binds).toEqual({ id: 5, total: 450, saldo: 450, estado: 'PENDIENTE', fechaVencimiento: '2026-12-01', idCondicionCredito: null });
  });
  it('OBSERVACIÓN: update y remove no bloquean ni revalidan el saldo dentro de su transacción', async () => {
    // El servicio revisa "sin movimientos" y luego el repositorio escribe sin FOR UPDATE:
    // un pago aplicado entre ambos pasos quedaría pisado al reiniciar SALDO = TOTAL.
    const { ejecuto } = conexion([]);
    await documentos.update(5, { total: 450, saldo: 450 });
    await documentos.remove(5);
    expect(ejecuto(/FOR UPDATE/)).toHaveLength(0);
  });
  it('remove: borra y confirma; error de Oracle revierte', async () => {
    const { conn, ejecuto } = conexion([]);
    await documentos.remove(5);
    expect(ejecuto(/DELETE FROM CXC_DOCUMENTOS/)).toHaveLength(1);
    expect(conn.commit).toHaveBeenCalledOnce();
    const c2 = conexion([]);
    c2.conn.execute.mockRejectedValueOnce(new Error('ORA-02292 child record found'));
    await expect(documentos.remove(5)).rejects.toThrow(/ORA-02292/);
    expect(c2.conn.rollback).toHaveBeenCalledOnce();
  });

  describe('anular', () => {
    const datos = { idEmpleadoAnulacion: 2, motivoAnulacion: 'Emitido al cliente equivocado', fechaAnulacion: HOY };
    it('inexistente → 404; pagado o ya anulado → 409', async () => {
      conexion([]);
      await expect(documentos.anular(5, datos)).rejects.toMatchObject({ statusCode: 404 });
      conexion([{ sql: /SELECT ESTADO, SALDO FROM CXC_DOCUMENTOS/, rows: [{ ESTADO: 'PAGADO', SALDO: 0 }] }]);
      await expect(documentos.anular(5, datos)).rejects.toThrow(/ya pagado/);
      conexion([{ sql: /SELECT ESTADO, SALDO FROM CXC_DOCUMENTOS/, rows: [{ ESTADO: 'ANULADO', SALDO: 0 }] }]);
      await expect(documentos.anular(5, datos)).rejects.toThrow(/ya está anulado/);
    });
    it('sin notas de mora: solo anula el documento', async () => {
      const { ejecuto } = conexion([{ sql: /SELECT ESTADO, SALDO FROM CXC_DOCUMENTOS/, rows: [{ ESTADO: 'VENCIDO', SALDO: 300 }] }]);
      await documentos.anular(5, datos);
      expect(ejecuto(/WHERE ID_DOCUMENTO = :idNota/)).toHaveLength(0);
      expect(ejecuto(/SET SALDO = 0, ESTADO = 'ANULADO'/)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe('recibo.repository', () => {
  const reglas = (o: { pago?: unknown[]; emitidos?: number; recibo?: unknown[] } = {}): Regla[] => [
    { sql: /SELECT MONTO FROM CXC_PAGOS/, rows: o.pago ?? [{ MONTO: 100 }] },
    { sql: /SUM\(MONTO\), 0\) AS TOTAL FROM CXC_RECIBOS/, rows: [{ TOTAL: o.emitidos ?? 0 }] },
    { sql: /SELECT ESTADO FROM CXC_RECIBOS WHERE ID_RECIBO = :id FOR UPDATE/, rows: o.recibo ?? [{ ESTADO: 'CANCELADO' }] },
    { sql: /INSERT INTO CXC_RECIBOS/, outId: 9 },
  ];
  const nuevo = { idCliente: 1, idPago: 4, fecha: HOY, estado: 'EMITIDO' as const };

  it('previewRecibo: número sin bloqueo y lo que falta respaldar', async () => {
    const { ejecuto } = conexion(reglas({ emitidos: 40 }));
    await expect(recibos.previewRecibo(4, HOY)).resolves.toEqual({ numeroRecibo: 'REC-2026-000001', monto: 60 });
    expect(ejecuto(/FOR UPDATE|LOCK TABLE/)).toHaveLength(0);
  });
  it('previewRecibo: pago inexistente → monto null', async () => {
    conexion(reglas({ pago: [] }));
    await expect(recibos.previewRecibo(4, HOY)).resolves.toMatchObject({ monto: null });
  });
  it('create: pago inexistente → 404; ya respaldado por completo → 409', async () => {
    conexion(reglas({ pago: [] }));
    await expect(recibos.create(nuevo)).rejects.toMatchObject({ statusCode: 404 });
    const { ejecuto } = conexion(reglas({ emitidos: 100 }));
    await expect(recibos.create(nuevo)).rejects.toThrow(/todo su monto/);
    expect(ejecuto(/INSERT INTO CXC_RECIBOS/)).toHaveLength(0);
  });
  it('create: bloquea el pago y emite solo por el faltante', async () => {
    const { conn, ejecuto } = conexion(reglas({ emitidos: 30 }));
    await expect(recibos.create(nuevo)).resolves.toBe(9);
    expect(ejecuto(/SELECT MONTO FROM CXC_PAGOS WHERE ID_PAGO = :idPago FOR UPDATE/)).toHaveLength(1);
    expect(ejecuto(/INSERT INTO CXC_RECIBOS/)[0].binds).toMatchObject({ monto: 70, numeroRecibo: 'REC-2026-000001' });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('update / remove: emitido → 409; inexistente → 404; cancelado se modifica', async () => {
    conexion(reglas({ recibo: [{ ESTADO: 'EMITIDO' }] }));
    await expect(recibos.update(9, { fecha: HOY })).rejects.toThrow(/no puede modificarse/);
    conexion(reglas({ recibo: [{ ESTADO: 'EMITIDO' }] }));
    await expect(recibos.remove(9)).rejects.toThrow(/no puede eliminarse/);
    conexion(reglas({ recibo: [] }));
    await expect(recibos.remove(9)).rejects.toMatchObject({ statusCode: 404 });
    const { ejecuto } = conexion(reglas());
    await recibos.update(9, { fecha: HOY, idPago: 4 });
    expect(ejecuto(/UPDATE CXC_RECIBOS/)[0].binds).toEqual({ id: 9, idPago: 4, fecha: HOY });
    await recibos.update(9, {});
  });
  it('OBSERVACIÓN: volver un recibo CANCELADO a EMITIDO no revisa si el pago ya está respaldado por otros recibos', async () => {
    const { ejecuto } = conexion(reglas({ emitidos: 100 }));
    await recibos.update(9, { estado: 'EMITIDO' });
    expect(ejecuto(/SUM\(MONTO\)/)).toHaveLength(0);
    expect(ejecuto(/UPDATE CXC_RECIBOS/)[0].binds.estado).toBe('EMITIDO');
  });
});

// ---------------------------------------------------------------------------
describe('factura.repository (FEL)', () => {
  const params = {
    idEmpresa: 1, idCliente: 1, idTipoDocumento: 81, idMoneda: 1, idCondicionCredito: 3, idEmpleado: 2,
    serieFel: 'A1B2C3D4', uuid: 'uuid-1', fechaEmision: HOY, fechaVencimiento: '2026-11-26',
    nitEmisor: '12345679', nombreEmisor: 'Comercial Andina', nitReceptor: 'CF', nombreReceptor: 'Consumidor Final',
    subtotalGravado: 100, iva: 12, total: 112,
    lineas: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 112, total: 112 }, { codigoProducto: 'P1', descripcion: 'Repuesto', cantidad: 2, precioUnitario: 0.5, total: 1 }],
    construirXml: vi.fn(() => '<dte/>'),
  };

  it('emitir: bloquea la empresa, toma el siguiente número FEL y guarda documento, líneas y certificado juntos', async () => {
    const { conn, ejecuto, ejecuciones } = conexion([
      { sql: /SIGUIENTE FROM CXC_FACTURA_FEL/, rows: [{ SIGUIENTE: 15 }] },
      { sql: /INSERT INTO CXC_DOCUMENTOS/, outId: 300 },
      { sql: /INSERT INTO CXC_FACTURA_FEL/, outId: 20 },
    ]);
    await expect(fel.emitir(params)).resolves.toBe(20);
    expect(ejecuciones[0].sql).toMatch(/FROM CXC_EMPRESAS WHERE ID_EMPRESA = :id FOR UPDATE/);
    expect(ejecuto(/INSERT INTO CXC_DOCUMENTOS/)[0].binds).toMatchObject({ serie: 'A1B2C3D4', numero: '15', total: 112, idCondicion: 3 });
    expect(ejecuto(/INSERT INTO CXC_DOCUMENTO_DETALLE/).map((e) => e.binds.codigo)).toEqual([null, 'P1']);
    expect(ejecuto(/INSERT INTO CXC_FACTURA_FEL/)[0].binds).toMatchObject({ idDocumento: 300, numero: 15 });
    expect(params.construirXml).toHaveBeenCalledWith(15, expect.any(String));
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  describe('anular', () => {
    const datos = { idEmpleadoAnulacion: 2, motivoAnulacion: 'Datos del receptor errados' };
    const reglas = (o: { fel?: unknown[]; doc?: unknown[] } = {}): Regla[] => [
      { sql: /FROM CXC_FACTURA_FEL WHERE ID_FACTURA_FEL = :id FOR UPDATE/, rows: o.fel ?? [{ ID_DOCUMENTO: 300, ESTADO: 'CERTIFICADA' }] },
      { sql: /SELECT ESTADO, TOTAL, SALDO FROM CXC_DOCUMENTOS/, rows: o.doc ?? [{ ESTADO: 'PENDIENTE', TOTAL: 112, SALDO: 112 }] },
    ];
    it('inexistente → 404; ya anulada → 409', async () => {
      conexion(reglas({ fel: [] }));
      await expect(fel.anular(20, 'u', datos)).rejects.toMatchObject({ statusCode: 404 });
      conexion(reglas({ fel: [{ ID_DOCUMENTO: 300, ESTADO: 'ANULADA' }] }));
      await expect(fel.anular(20, 'u', datos)).rejects.toThrow(/ya está anulada/);
    });
    it('con pagos o notas aplicadas → 409', async () => {
      const { ejecuto } = conexion(reglas({ doc: [{ ESTADO: 'PARCIAL', TOTAL: 112, SALDO: 50 }] }));
      await expect(fel.anular(20, 'u', datos)).rejects.toThrow(/Reversa primero/);
      expect(ejecuto(/SET ESTADO = 'ANULADA'/)).toHaveLength(0);
    });
    it('éxito: anula el certificado y el documento en la misma transacción', async () => {
      const { conn, ejecuto } = conexion(reglas());
      await fel.anular(20, 'uuid-anul', datos);
      expect(ejecuto(/UPDATE CXC_FACTURA_FEL/)[0].binds).toMatchObject({ uuid: 'uuid-anul', idEmpleado: 2 });
      expect(ejecuto(/SET SALDO = 0, ESTADO = 'ANULADO'/)[0].binds.idDocumento).toBe(300);
      expect(conn.commit).toHaveBeenCalledOnce();
    });
    it.fails('DEFECTO: anular la factura FEL también debe anular sus notas de débito por mora pendientes (como Documentos)', async () => {
      const { ejecuto } = conexion(reglas());
      await fel.anular(20, 'uuid-anul', datos);
      expect(ejecuto(/WHERE ID_DOCUMENTO_ORIGEN = :id/)).toHaveLength(1);
    });
  });
});
