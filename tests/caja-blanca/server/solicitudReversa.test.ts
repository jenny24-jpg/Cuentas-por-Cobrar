import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

const ops = vi.hoisted(() => ({
  reversarAplicacionPago: vi.fn(), reversarAplicacionAnticipo: vi.fn(), reversarNc: vi.fn(),
  anularPago: vi.fn(), anularAnticipo: vi.fn(), anularNc: vi.fn(), anularDocumento: vi.fn(), anularFactura: vi.fn(),
}));
vi.mock('../../../server/src/modules/cxc/services/pagos/aplicacionPago.service', () => ({ reversarAplicacionPago: ops.reversarAplicacionPago }));
vi.mock('../../../server/src/modules/cxc/services/pagos/aplicacionAnticipo.service', () => ({ reversarAplicacionAnticipo: ops.reversarAplicacionAnticipo }));
vi.mock('../../../server/src/modules/cxc/services/credito/aplicacionNotaCredito.service', () => ({ reversar: ops.reversarNc }));
vi.mock('../../../server/src/modules/cxc/services/pagos/pago.service', () => ({ anularPago: ops.anularPago }));
vi.mock('../../../server/src/modules/cxc/services/pagos/anticipo.service', () => ({ anularAnticipo: ops.anularAnticipo }));
vi.mock('../../../server/src/modules/cxc/services/credito/notaCredito.service', () => ({ anular: ops.anularNc }));
vi.mock('../../../server/src/modules/cxc/services/documentos/documento.service', () => ({ anularDocumento: ops.anularDocumento }));
vi.mock('../../../server/src/modules/cxc/services/facturacion/factura.service', () => ({ anularFactura: ops.anularFactura }));

import * as service from '../../../server/src/modules/cxc/services/autorizaciones/solicitudReversa.service';
import * as repo from '../../../server/src/modules/cxc/repositories/autorizaciones/solicitudReversa.repository';

const OPERADOR = { idUsuario: 4, rol: 'OPERADOR' };
const ADMIN = { idUsuario: 2, rol: 'ADMIN' };
const OTRO_ADMIN = { idUsuario: 9, rol: 'ADMIN' };
const CONSULTA = { idUsuario: 3, rol: 'CONSULTA' };

const fila = (extra: Record<string, unknown> = {}) => ({
  ID_SOLICITUD: 1, TIPO: 'REVERSA_APLICACION_PAGO', ID_REGISTRO: 546, REFERENCIA: 'PAG-2026-000003 → FACT-00000002', MONTO: 50,
  MOTIVO: 'Se aplicó al cliente equivocado', ESTADO: 'PENDIENTE', ID_USUARIO_SOLICITA: 4, SOLICITANTE: 'María López', ROL_SOLICITANTE: 'OPERADOR',
  FECHA_SOLICITUD: '2026-10-30T10:00:00', ID_USUARIO_RESUELVE: null, RESOLVIO: null, FECHA_RESOLUCION: null, MOTIVO_RECHAZO: null,
  ID_EMPLEADO_SOLICITA: 12, ...extra,
});

/** Conexión que responde según la regla; cada llamada a getConnection devuelve una nueva con las mismas reglas. */
function base(reglas: Regla[]) {
  const todas: ReturnType<typeof crearConexion>[] = [];
  db.getConnection.mockImplementation(async () => { const c = crearConexion(reglas); todas.push(c); return c.conn; });
  return { ejecuto: (p: RegExp) => todas.flatMap((c) => c.ejecuto(p)) };
}

beforeEach(() => { Object.values(ops).forEach((f) => f.mockResolvedValue(undefined)); });

// ---------------------------------------------------------------------------
describe('solicitar', () => {
  const objetivo = (abierto = 1): Regla => ({ sql: /ABIERTO/, rows: [{ REFERENCIA: 'PAG-2026-000003 → FACT-00000002', MONTO: 50, ABIERTO: abierto }] });
  const datos = { tipo: 'REVERSA_APLICACION_PAGO', idRegistro: 546, motivo: 'Se aplicó al cliente equivocado' };

  it('CONSULTA no puede solicitar', () => expect(service.solicitar(datos, CONSULTA, 5)).rejects.toMatchObject({ statusCode: 403 }));
  it('motivo corto o tipo inválido → validación', async () => {
    await expect(service.solicitar({ ...datos, motivo: 'error' }, OPERADOR, 12)).rejects.toThrow(/mínimo 10/);
    await expect(service.solicitar({ ...datos, tipo: 'BORRAR_TODO' }, OPERADOR, 12)).rejects.toThrow(/no válido/);
  });
  it('registro inexistente → 404; ya reversado → 409', async () => {
    base([]);
    await expect(service.solicitar(datos, OPERADOR, 12)).rejects.toMatchObject({ statusCode: 404 });
    base([objetivo(0)]);
    await expect(service.solicitar(datos, OPERADOR, 12)).rejects.toThrow(/ya fue reversada/);
  });
  it('registra PENDIENTE con la referencia y el monto del momento; no ejecuta nada', async () => {
    const { ejecuto } = base([objetivo(), { sql: /INSERT INTO CXC_SOLICITUDES_REVERSA/, outId: 1 }, { sql: /WHERE s.ID_SOLICITUD = :id/, rows: [fila()] }]);
    const s = await service.solicitar(datos, OPERADOR, 12);
    expect(ejecuto(/INSERT INTO CXC_SOLICITUDES_REVERSA/)[0].binds).toMatchObject({ tipo: 'REVERSA_APLICACION_PAGO', idRegistro: 546, monto: 50, idUsuario: 4, idEmpleado: 12 });
    expect(s).toMatchObject({ idSolicitud: 1, estado: 'PENDIENTE' });
    expect(s).not.toHaveProperty('idEmpleadoSolicita');
    expect(ops.reversarAplicacionPago).not.toHaveBeenCalled();
  });
  it('ya hay una pendiente para lo mismo → 409', async () => {
    base([objetivo()]);
    const original = db.getConnection.getMockImplementation()!;
    db.getConnection.mockImplementation(async () => {
      const conn = await original();
      const exec = conn.execute.getMockImplementation()!;
      conn.execute.mockImplementation(async (sql: string, b?: Record<string, unknown>) => {
        if (/INSERT INTO CXC_SOLICITUDES_REVERSA/.test(sql)) throw Object.assign(new Error('ORA-00001: unique constraint (X.UX_CXC_SR_PENDIENTE) violated'), { errorNum: 1 });
        return exec(sql, b);
      });
      return conn;
    });
    await expect(service.solicitar(datos, OPERADOR, 12)).rejects.toThrow(/Ya hay una solicitud pendiente/);
  });
});

// ---------------------------------------------------------------------------
describe('aprobar', () => {
  const reglas = (s = fila()): Regla[] => [{ sql: /WHERE s.ID_SOLICITUD = :id/, rows: [s] }];

  it('solo ADMIN', () => expect(service.aprobar(1, OPERADOR)).rejects.toMatchObject({ statusCode: 403 }));
  it('un ADMIN no aprueba su propia solicitud; otro ADMIN sí', async () => {
    base(reglas(fila({ ID_USUARIO_SOLICITA: 2, ROL_SOLICITANTE: 'ADMIN' })));
    await expect(service.aprobar(1, ADMIN)).rejects.toThrow(/otro administrador/);
    expect(ops.reversarAplicacionPago).not.toHaveBeenCalled();
    await service.aprobar(1, OTRO_ADMIN);
    expect(ops.reversarAplicacionPago).toHaveBeenCalled();
  });
  it('ya resuelta → 409; inexistente → 404', async () => {
    base(reglas(fila({ ESTADO: 'RECHAZADA' })));
    await expect(service.aprobar(1, ADMIN)).rejects.toMatchObject({ statusCode: 409 });
    base([]);
    await expect(service.aprobar(1, ADMIN)).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['REVERSA_APLICACION_PAGO', 'reversarAplicacionPago', { idEmpleadoReversa: 12, motivoReversa: 'Se aplicó al cliente equivocado' }],
    ['REVERSA_APLICACION_ANTICIPO', 'reversarAplicacionAnticipo', { idEmpleadoReversa: 12 }],
    ['REVERSA_APLICACION_NC', 'reversarNc', { idEmpleadoReversa: 12 }],
    ['ANULACION_PAGO', 'anularPago', { idEmpleadoAnulacion: 12, motivoAnulacion: 'Se aplicó al cliente equivocado' }],
    ['ANULACION_ANTICIPO', 'anularAnticipo', { idEmpleadoAnulacion: 12 }],
    ['ANULACION_DOCUMENTO', 'anularDocumento', { idEmpleadoAnulacion: 12 }],
    ['ANULACION_FACTURA_FEL', 'anularFactura', { idEmpleadoAnulacion: 12 }],
  ] as const)('%s ejecuta %s con el empleado y motivo del solicitante', async (tipo, op, args) => {
    const { ejecuto } = base(reglas(fila({ TIPO: tipo })));
    await service.aprobar(1, ADMIN);
    expect(ops[op]).toHaveBeenCalledWith(546, expect.objectContaining(args));
    expect(ejecuto(/SET ESTADO = :estado/)[0].binds).toMatchObject({ estado: 'APROBADA', idUsuario: 2 });
  });
  it('anulación de NC se ejecuta con nivel ADMIN (ya autorizada)', async () => {
    base(reglas(fila({ TIPO: 'ANULACION_NOTA_CREDITO' })));
    await service.aprobar(1, ADMIN);
    expect(ops.anularNc).toHaveBeenCalledWith(546, expect.objectContaining({ idEmpleadoAnulacion: 12 }), 'ADMIN');
  });
  it('si la operación falla, la solicitud vuelve a PENDIENTE y se informa el error', async () => {
    const { ejecuto } = base(reglas());
    ops.reversarAplicacionPago.mockRejectedValue(new Error('El documento está anulado'));
    await expect(service.aprobar(1, ADMIN)).rejects.toThrow(/anulado/);
    const sqls = ejecuto(/UPDATE CXC_SOLICITUDES_REVERSA/).map((e) => e.sql);
    expect(sqls[0]).toMatch(/ESTADO = 'PENDIENTE'$|WHERE ID_SOLICITUD = :id AND ESTADO = 'PENDIENTE'/);
    expect(sqls[1]).toMatch(/SET ESTADO = 'PENDIENTE'/);
  });
});

// ---------------------------------------------------------------------------
describe('rechazar y cancelar', () => {
  it('rechazar: ADMIN distinto y con motivo; no ejecuta nada', async () => {
    const { ejecuto } = base([{ sql: /WHERE s.ID_SOLICITUD = :id/, rows: [fila()] }]);
    await expect(service.rechazar(1, { motivoRechazo: 'corto' }, ADMIN)).rejects.toThrow(/mínimo 10/);
    await expect(service.rechazar(1, { motivoRechazo: 'El monto aplicado es correcto' }, OPERADOR)).rejects.toMatchObject({ statusCode: 403 });
    await service.rechazar(1, { motivoRechazo: 'El monto aplicado es correcto' }, ADMIN);
    expect(ejecuto(/SET ESTADO = :estado/)[0].binds).toMatchObject({ estado: 'RECHAZADA', motivoRechazo: 'El monto aplicado es correcto' });
    expect(Object.values(ops).every((f) => !f.mock.calls.length)).toBe(true);
  });
  it('cancelar: solo quien la pidió y mientras esté pendiente', async () => {
    base([{ sql: /WHERE s.ID_SOLICITUD = :id/, rows: [fila()] }]);
    await expect(service.cancelar(1, ADMIN)).rejects.toMatchObject({ statusCode: 403 });
    await service.cancelar(1, OPERADOR);
    base([{ sql: /WHERE s.ID_SOLICITUD = :id/, rows: [fila({ ESTADO: 'APROBADA' })] }]);
    await expect(service.cancelar(1, OPERADOR)).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
describe('repositorio y consultas', () => {
  it('resolver: si otro administrador ya la resolvió → 409', async () => {
    base([{ sql: /SELECT 1 FROM CXC_SOLICITUDES_REVERSA/, rows: [{ 1: 1 }] }]);
    const original = db.getConnection.getMockImplementation()!;
    db.getConnection.mockImplementation(async () => {
      const conn = await original();
      const exec = conn.execute.getMockImplementation()!;
      conn.execute.mockImplementation(async (sql: string, b?: Record<string, unknown>) =>
        (/^\s*UPDATE/.test(sql) ? { rowsAffected: 0 } : exec(sql, b)));
      return conn;
    });
    await expect(repo.resolver(1, { estado: 'APROBADA', idUsuario: 2 })).rejects.toThrow(/ya fue resuelta/);
  });
  it('listado: estado inválido → 400; pendientes primero', async () => {
    await expect(service.list({ estado: 'X' })).rejects.toMatchObject({ statusCode: 400 });
    const { ejecuto } = base([{ sql: /COUNT\(\*\) AS TOTAL/, rows: [{ TOTAL: 1 }] }]);
    await service.list({ estado: 'pendiente', search: 'PAG' });
    expect(ejecuto(/OFFSET/)[0].sql).toMatch(/ORDER BY CASE WHEN s.ESTADO = 'PENDIENTE' THEN 0 ELSE 1 END/);
    expect(ejecuto(/OFFSET/)[0].binds).toMatchObject({ estado: 'PENDIENTE', search: '%PAG%' });
  });
  it('pendientes por tipo y conteo', async () => {
    base([{ sql: /SELECT ID_REGISTRO/, rows: [{ ID_REGISTRO: 546 }] }, { sql: /SELECT COUNT\(\*\) AS TOTAL FROM CXC_SOLICITUDES_REVERSA WHERE ESTADO/, rows: [{ TOTAL: 3 }] }]);
    await expect(service.pendientes('reversa_aplicacion_pago')).resolves.toEqual([546]);
    await expect(service.pendientes('OTRO')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.contarPendientes()).resolves.toEqual({ pendientes: 3 });
  });
});
