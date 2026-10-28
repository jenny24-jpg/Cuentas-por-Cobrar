import { describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
const historial = vi.hoisted(() => ({ registrarEvento: vi.fn(async () => undefined) }));
vi.mock('../../../server/src/config/database', () => db);
vi.mock('../../../server/src/modules/cxc/repositories/documentos/documentoHistorial.repository', () => historial);

import { aprobar, rechazar } from '../../../server/src/modules/cxc/repositories/documentos/ajuste.repository';

const ajuste = (extra: Record<string, unknown> = {}) => ({
  ID_AJUSTE: 8, ID_CLIENTE: 10, ID_DOCUMENTO: 2, TIPO_AJUSTE: 'CREDITO', MONTO: 30, ESTADO: 'PENDIENTE', ID_EMPLEADO_APROBADOR: null, ...extra,
});
const reglas = (a: unknown[], documento: unknown[] = [{ ID_DOCUMENTO: 2, ID_CLIENTE: 10, TOTAL: 100, SALDO: 100, ESTADO: 'PENDIENTE' }]): Regla[] => [
  { sql: /FROM CXC_AJUSTES WHERE ID_AJUSTE = :id FOR UPDATE/, rows: a },
  { sql: /FROM CXC_DOCUMENTOS WHERE ID_DOCUMENTO = :idDocumento FOR UPDATE/, rows: documento },
];
const abrir = (r: Regla[]) => {
  const c = crearConexion(r);
  db.getConnection.mockResolvedValue(c.conn);
  return c;
};

describe('ajuste.aprobar — doble aprobación', () => {
  it('inexistente', async () => {
    abrir(reglas([]));
    await expect(aprobar(8, { idEmpleadoAprobador: 5 })).rejects.toThrow(/no encontrado/);
  });
  it.each(['APROBADO', 'RECHAZADO', 'ANULADO'])('estado %s no se aprueba', async (ESTADO) => {
    abrir(reglas([ajuste({ ESTADO })]));
    await expect(aprobar(8, { idEmpleadoAprobador: 5 })).rejects.toThrow(/Solo un ajuste pendiente/);
  });
  it('primera aprobación: solo pasa a EN_2DA_APROBACION, sin tocar saldo', async () => {
    const { conn, ejecuto } = abrir(reglas([ajuste()]));
    await aprobar(8, { idEmpleadoAprobador: 5 });
    expect(ejecuto(/SET ESTADO = 'EN_2DA_APROBACION'/)[0].binds).toMatchObject({ idEmpleadoAprobador: 5 });
    expect(ejecuto(/UPDATE CXC_DOCUMENTOS/)).toHaveLength(0);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('segunda aprobación por el mismo empleado se rechaza', async () => {
    abrir(reglas([ajuste({ ESTADO: 'EN_2DA_APROBACION', ID_EMPLEADO_APROBADOR: 5 })]));
    await expect(aprobar(8, { idEmpleadoAprobador: 5 })).rejects.toThrow(/empleado distinto/);
  });
  it('sin documento asociado', async () => {
    abrir(reglas([ajuste({ ESTADO: 'EN_2DA_APROBACION', ID_EMPLEADO_APROBADOR: 5, ID_DOCUMENTO: null })]));
    await expect(aprobar(8, { idEmpleadoAprobador: 6 })).rejects.toThrow(/no tiene un documento/);
  });
  it('documento inexistente o pagado', async () => {
    abrir(reglas([ajuste({ ESTADO: 'EN_2DA_APROBACION', ID_EMPLEADO_APROBADOR: 5 })], []));
    await expect(aprobar(8, { idEmpleadoAprobador: 6 })).rejects.toThrow(/ya no existe/);
    abrir(reglas([ajuste({ ESTADO: 'EN_2DA_APROBACION', ID_EMPLEADO_APROBADOR: 5 })], [{ ID_DOCUMENTO: 2, TOTAL: 100, SALDO: 0, ESTADO: 'PAGADO' }]));
    await expect(aprobar(8, { idEmpleadoAprobador: 6 })).rejects.toThrow(/pagado o anulado/);
  });
  it('crédito mayor al saldo se rechaza', async () => {
    abrir(reglas([ajuste({ ESTADO: 'EN_2DA_APROBACION', ID_EMPLEADO_APROBADOR: 5, MONTO: 100.01 })]));
    await expect(aprobar(8, { idEmpleadoAprobador: 6 })).rejects.toThrow(/no puede superar el saldo/);
  });
  it('crédito reduce el saldo (ABONO); débito lo aumenta (CARGO)', async () => {
    let c = abrir(reglas([ajuste({ ESTADO: 'EN_2DA_APROBACION', ID_EMPLEADO_APROBADOR: 5 })]));
    await aprobar(8, { idEmpleadoAprobador: 6 });
    expect(c.ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 70, estado: 'PARCIAL' });
    expect(c.ejecuto(/SET ESTADO = 'APROBADO'/)[0].binds).toMatchObject({ idEmpleadoAprobador2: 6 });
    expect(historial.registrarEvento).toHaveBeenLastCalledWith(c.conn, expect.objectContaining({ naturaleza: 'ABONO', monto: 30 }));

    c = abrir(reglas([ajuste({ ESTADO: 'en_2da_aprobacion ', ID_EMPLEADO_APROBADOR: 5, TIPO_AJUSTE: 'DEBITO' })]));
    await aprobar(8, { idEmpleadoAprobador: 6 });
    expect(c.ejecuto(/UPDATE CXC_DOCUMENTOS/)[0].binds).toMatchObject({ saldo: 130, estado: 'PENDIENTE' });
    expect(historial.registrarEvento).toHaveBeenLastCalledWith(c.conn, expect.objectContaining({ naturaleza: 'CARGO' }));
  });
});

describe('ajuste.rechazar', () => {
  const datos = { idEmpleadoAprobador: 6, motivoRechazo: 'Monto mal calculado' };

  it('estado no rechazable', async () => {
    abrir(reglas([{ ESTADO: 'APROBADO' }]));
    await expect(rechazar(8, datos)).rejects.toThrow(/Solo un ajuste pendiente/);
  });
  it('en primera instancia registra al aprobador 1', async () => {
    const { ejecuto } = abrir(reglas([{ ESTADO: 'PENDIENTE' }]));
    await rechazar(8, datos);
    const upd = ejecuto(/SET ESTADO = 'RECHAZADO'/)[0].sql;
    expect(upd).toContain('ID_EMPLEADO_APROBADOR = :idEmpleadoAprobador');
    expect(upd).not.toContain('APROBADOR_2');
  });
  it('en segunda instancia NO borra al primer aprobador', async () => {
    const { ejecuto, conn } = abrir(reglas([{ ESTADO: 'EN_2DA_APROBACION' }]));
    await rechazar(8, datos);
    const upd = ejecuto(/SET ESTADO = 'RECHAZADO'/)[0].sql;
    expect(upd).toContain('ID_EMPLEADO_APROBADOR_2 = :idEmpleadoAprobador');
    expect(upd).toContain('FECHA_APROBACION_2 =');
    expect(upd).not.toMatch(/ID_EMPLEADO_APROBADOR = /);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});
