import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as repo from '../../../server/src/modules/cxc/repositories/credito/notaCredito.repository';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const reglas = (o: { nota?: unknown[]; aplicado?: number; historial?: number; actual?: unknown[] } = {}): Regla[] => [
  { sql: /NATURALEZA = 'CREDITO'/, rows: [{ CODIGO: 'NC' }] },
  { sql: /MAX\(CASE/, rows: [{ ULTIMO: 6 }] },
  { sql: /INSERT INTO CXC_NOTAS_CREDITO/, outId: 77 },
  { sql: /SELECT ESTADO, TO_CHAR\(FECHA, 'YYYY-MM-DD'\) AS FECHA_ISO FROM CXC_NOTAS_CREDITO/, rows: o.nota ?? [{ ESTADO: 'PENDIENTE', FECHA_ISO: '2026-10-20' }] },
  { sql: /SUM\(MONTO_APLICADO\)/, rows: [{ TOTAL: o.aplicado ?? 0 }] },
  { sql: /COUNT\(\*\) AS TOTAL FROM CXC_APLICACION_NOTA_CREDITO/, rows: [{ TOTAL: o.historial ?? 0 }] },
  { sql: /SELECT ID_CLIENTE, ID_DOCUMENTO_REFERENCIA FROM CXC_NOTAS_CREDITO/, rows: o.actual ?? [{ ID_CLIENTE: 1, ID_DOCUMENTO_REFERENCIA: 5 }] },
];

function conexion(r: Regla[]) {
  const c = crearConexion(r);
  db.getConnection.mockResolvedValue(c.conn);
  return c;
}

describe('notaCredito.repository', () => {
  describe('create', () => {
    const datos = { idCliente: 1, idDocumentoReferencia: 5, descripcion: 'Descuento por volumen', fecha: HOY, monto: 50, estado: 'PENDIENTE' as const };
    it('fecha distinta de hoy → 400 sin abrir conexión', async () => {
      await expect(repo.create({ ...datos, fecha: '2026-10-26' }, 10)).rejects.toThrow(/fecha actual/);
      expect(db.getConnection).not.toHaveBeenCalled();
    });
    it('numera con bloqueo, nace PENDIENTE y registra quién la creó', async () => {
      const { conn, ejecuto, ejecuciones } = conexion(reglas());
      await expect(repo.create(datos, 10)).resolves.toBe(77);
      const sqls = ejecuciones.map((e) => e.sql);
      expect(sqls.findIndex((s) => /LOCK TABLE CXC_NOTAS_CREDITO/.test(s))).toBeLessThan(sqls.findIndex((s) => /INSERT INTO CXC_NOTAS_CREDITO/.test(s)));
      expect(ejecuto(/INSERT INTO CXC_NOTAS_CREDITO/)[0].binds).toMatchObject({ serie: 'NC', numero: '000007', idEmpleadoRegistro: 10, fecha: HOY });
      expect(ejecuto(/INSERT INTO CXC_NOTAS_CREDITO/)[0].sql).toMatch(/'PENDIENTE'/);
      expect(conn.commit).toHaveBeenCalledOnce();
    });
    it('sin tipo CREDITO en la base → revierte', async () => {
      const { conn } = conexion([]);
      await expect(repo.create(datos, 10)).rejects.toThrow(/DBA/);
      expect(conn.rollback).toHaveBeenCalledOnce();
    });
  });

  describe('update', () => {
    it('no cambia la fecha; sin campos no abre conexión', async () => {
      await expect(repo.update(6, { fecha: HOY })).rejects.toThrow(/no puede modificarse/);
      await repo.update(6, {});
      expect(db.getConnection).not.toHaveBeenCalled();
    });
    it('inexistente → 404', async () => {
      conexion(reglas({ nota: [] }));
      await expect(repo.update(6, { monto: 40 })).rejects.toMatchObject({ statusCode: 404 });
    });
    it('con aplicaciones confirmadas → 409', async () => {
      conexion(reglas({ aplicado: 50 }));
      await expect(repo.update(6, { monto: 40 })).rejects.toThrow(/ya tiene aplicaciones/);
    });
    it('anulada → 409', async () => {
      conexion(reglas({ nota: [{ ESTADO: 'ANULADA', FECHA_ISO: '2026-10-20' }] }));
      await expect(repo.update(6, { monto: 40 })).rejects.toThrow(/pendientes o activas/);
    });
    it('ya asignada alguna vez (aunque se reversara): no cambia de factura', async () => {
      const { ejecuto } = conexion(reglas({ historial: 1 }));
      await expect(repo.update(6, { idDocumentoReferencia: 8 })).rejects.toThrow(/no puede cambiarse de cliente ni de factura/);
      expect(ejecuto(/UPDATE CXC_NOTAS_CREDITO/)).toHaveLength(0);
    });
    it('mismo cliente y factura con historial sí se acepta', async () => {
      const { ejecuto } = conexion(reglas({ historial: 1 }));
      await repo.update(6, { idCliente: 1, idDocumentoReferencia: 5, descripcion: 'Ajuste de texto' });
      expect(ejecuto(/UPDATE CXC_NOTAS_CREDITO/)).toHaveLength(1);
    });
    it('todo cambio borra la aprobación', async () => {
      const { conn, ejecuto } = conexion(reglas());
      await repo.update(6, { monto: 40 });
      const upd = ejecuto(/UPDATE CXC_NOTAS_CREDITO/)[0];
      expect(upd.sql).toMatch(/ID_EMPLEADO_APROBACION = NULL, FECHA_APROBACION = NULL/);
      expect(upd.binds).toEqual({ id: 6, monto: 40 });
      expect(conn.commit).toHaveBeenCalledOnce();
    });
  });

  describe('remove (capa de datos)', () => {
    it('solo pendientes sin aplicaciones', async () => {
      conexion(reglas({ nota: [{ ESTADO: 'APLICADA', FECHA_ISO: HOY }] }));
      await expect(repo.remove(6)).rejects.toMatchObject({ statusCode: 409 });
      const { ejecuto } = conexion(reglas());
      await repo.remove(6);
      expect(ejecuto(/DELETE FROM CXC_NOTAS_CREDITO/)).toHaveLength(1);
    });
  });

  describe('anular', () => {
    const datos = { idEmpleadoAnulacion: 10, motivoAnulacion: 'Registrada por error' };
    it('con aplicaciones vigentes → 409', async () => {
      conexion(reglas({ aplicado: 10 }));
      await expect(repo.anular(6, datos)).rejects.toThrow(/aplicaciones vigentes/);
    });
    it('ya anulada → 409', async () => {
      conexion(reglas({ nota: [{ ESTADO: 'ANULADA', FECHA_ISO: '2026-10-20' }] }));
      await expect(repo.anular(6, datos)).rejects.toThrow(/ya está anulada/);
    });
    it('otro estado cerrado → 409', async () => {
      conexion(reglas({ nota: [{ ESTADO: 'APLICADA', FECHA_ISO: '2026-10-20' }] }));
      await expect(repo.anular(6, datos)).rejects.toThrow(/no está en un estado/);
    });
    it('fecha anterior a la emisión o futura → 400', async () => {
      conexion(reglas());
      await expect(repo.anular(6, { ...datos, fechaAnulacion: '2026-10-19' })).rejects.toThrow(/anterior a la fecha de emisión/);
      conexion(reglas());
      await expect(repo.anular(6, { ...datos, fechaAnulacion: '2026-10-28' })).rejects.toThrow(/futura/);
    });
    it('éxito: sin fecha usa hoy', async () => {
      const { conn, ejecuto } = conexion(reglas());
      await repo.anular(6, datos);
      expect(ejecuto(/SET ESTADO = 'ANULADA'/)[0].binds).toMatchObject({ idEmpleadoAnulacion: 10, fechaAnulacion: HOY, motivoAnulacion: 'Registrada por error' });
      expect(conn.commit).toHaveBeenCalledOnce();
    });
  });

  it('previewNumero no bloquea', async () => {
    const { ejecuto } = conexion(reglas());
    await expect(repo.previewNumero()).resolves.toEqual({ serie: 'NC', numero: '000007' });
    expect(ejecuto(/LOCK TABLE/)).toHaveLength(0);
  });

  it('findAll arma la búsqueda y la paginación', async () => {
    const { ejecuto } = conexion([{ sql: /COUNT\(\*\) AS TOTAL FROM CXC_NOTAS_CREDITO/, rows: [{ TOTAL: 4 }] }]);
    await expect(repo.findAll({ page: 3, limit: 5, search: 'NC-0' })).resolves.toEqual({ data: [], total: 4 });
    expect(ejecuto(/OFFSET/)[0].binds).toEqual({ search: '%NC-0%', offset: 10, limit: 5 });
  });
});
