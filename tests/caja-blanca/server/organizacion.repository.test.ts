import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as clientes from '../../../server/src/modules/cxc/repositories/organizacion/cliente.repository';
import * as rutas from '../../../server/src/modules/cxc/repositories/organizacion/ruta.repository';
import * as rutaService from '../../../server/src/modules/cxc/services/organizacion/ruta.service';

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
const oraUnico = (indice: string) => Object.assign(new Error(`ORA-00001: unique constraint (CXC.${indice}) violated`), { errorNum: 1 });

/** Hace fallar la ejecución de un SQL concreto las primeras `veces`. */
function fallar(conn: ReturnType<typeof crearConexion>['conn'], patron: RegExp, error: Error, veces = 1) {
  const original = conn.execute.getMockImplementation()!;
  let n = 0;
  conn.execute.mockImplementation(async (sql: string, b?: Record<string, unknown>) => {
    const r = await original(sql, b);
    if (patron.test(sql) && n++ < veces) throw error;
    return r;
  });
}

// ---------------------------------------------------------------------------
describe('cliente.repository', () => {
  const nuevo = { nombre: 'Ferretería Central', nit: '1234567-9', direccion: 'Zona 1', idCondicion: 3, estado: 'A' as const, idSegmento: 2 };
  const reglas = (o: { condicion?: unknown[]; nitDe?: string; segmento?: unknown[]; codigos?: unknown[] } = {}): Regla[] => [
    { sql: /SELECT ESTADO FROM CXC_CONDICIONES_CREDITO/, rows: o.condicion ?? [{ ESTADO: 'A' }] },
    { sql: /SELECT NOMBRE FROM CLIENTE/, rows: o.nitDe ? [{ NOMBRE: o.nitDe }] : [] },
    { sql: /SELECT CODIGO_CLIENTE AS C FROM CLIENTE/, rows: o.codigos ?? [{ C: 'CLI-00007' }, { C: 'CLI-00012' }] },
    { sql: /SELECT ESTADO FROM CXC_SEGMENTOS_CLIENTE/, rows: o.segmento ?? [{ ESTADO: 'A' }] },
    { sql: /INSERT INTO CLIENTE/, outId: 40 },
    { sql: /SELECT ID_CONDICION FROM CLIENTE WHERE ID_CLIENTE = :id FOR UPDATE/, rows: [{ ID_CONDICION: 9 }] },
  ];

  describe('create', () => {
    it('condición inexistente o inactiva → 400', async () => {
      conexion(reglas({ condicion: [] }));
      await expect(clientes.create(nuevo)).rejects.toThrow(/no existe/);
      conexion(reglas({ condicion: [{ ESTADO: 'I' }] }));
      await expect(clientes.create(nuevo)).rejects.toThrow(/inactiva/);
    });
    it('NIT ya registrado (comparado sin guiones) → 409 con el nombre del otro cliente', async () => {
      conexion(reglas({ nitDe: 'Distribuidora Los Pinos' }));
      await expect(clientes.create(nuevo)).rejects.toThrow(/Distribuidora Los Pinos/);
    });
    it('código consecutivo CLI-00013 y segmento en la misma transacción', async () => {
      const { conn, ejecuto } = conexion(reglas());
      await expect(clientes.create(nuevo)).resolves.toBe(40);
      expect(ejecuto(/INSERT INTO CLIENTE/)[0].binds.codigo).toBe('CLI-00013');
      expect(ejecuto(/MERGE INTO CXC_CLIENTE_SEGMENTO/)[0].binds).toEqual({ idCliente: 40, idSegmento: 2 });
      expect(conn.commit).toHaveBeenCalledOnce();
    });
    it('segmento inexistente o inactivo revierte el alta', async () => {
      const { conn } = conexion(reglas({ segmento: [] }));
      await expect(clientes.create(nuevo)).rejects.toThrow(/segmento seleccionado no existe/);
      expect(conn.commit).not.toHaveBeenCalled();
      conexion(reglas({ segmento: [{ ESTADO: 'I' }] }));
      await expect(clientes.create(nuevo)).rejects.toThrow(/inactivo/);
    });
    it('código tomado por otro usuario: reintenta y guarda', async () => {
      const { conn, ejecuto } = conexion(reglas());
      fallar(conn, /INSERT INTO CLIENTE/, oraUnico('UX_CLIENTE_CODIGO'), 1);
      await expect(clientes.create(nuevo)).resolves.toBe(40);
      expect(ejecuto(/INSERT INTO CLIENTE/)).toHaveLength(2);
    });
    it('NIT duplicado detectado por Oracle → 409', async () => {
      const { conn } = conexion(reglas());
      fallar(conn, /INSERT INTO CLIENTE/, oraUnico('UQ_CXC_CLIENTES_NIT'));
      await expect(clientes.create(nuevo)).rejects.toThrow(/NIT ya está registrado/);
    });
    it.fails('DEFECTO: si el código choca 3 veces el mensaje no debe decir que el NIT está repetido', async () => {
      const { conn } = conexion(reglas());
      fallar(conn, /INSERT INTO CLIENTE/, oraUnico('UX_CLIENTE_CODIGO'), 3);
      await expect(clientes.create(nuevo)).rejects.not.toThrow(/NIT/);
    });
  });

  describe('update', () => {
    const datos = { ...nuevo, idSegmento: null };
    it('inexistente → 404', async () => {
      conexion([]);
      await expect(clientes.update(1, datos)).rejects.toMatchObject({ statusCode: 404 });
    });
    it('conserva su condición actual aunque esté inactiva', async () => {
      const { ejecuto } = conexion([...reglas({ condicion: [{ ESTADO: 'I' }] }).filter((r) => !/ID_CONDICION FROM CLIENTE/.test(r.sql.source)),
        { sql: /SELECT ID_CONDICION FROM CLIENTE WHERE ID_CLIENTE = :id FOR UPDATE/, rows: [{ ID_CONDICION: 3 }] }]);
      await clientes.update(1, datos);
      expect(ejecuto(/UPDATE CLIENTE/)).toHaveLength(1);
    });
    it('cambiar a una condición inactiva → 400', async () => {
      conexion(reglas({ condicion: [{ ESTADO: 'I' }] }));
      await expect(clientes.update(1, datos)).rejects.toThrow(/inactiva/);
    });
    it('NIT de otro cliente → 409 (se excluye a sí mismo)', async () => {
      const { ejecuto } = conexion(reglas({ nitDe: 'Otro' }));
      await expect(clientes.update(1, datos)).rejects.toMatchObject({ statusCode: 409 });
      expect(ejecuto(/SELECT NOMBRE FROM CLIENTE/)[0].binds).toMatchObject({ excluirId: 1 });
    });
    it('segmento null lo quita', async () => {
      const { ejecuto } = conexion(reglas());
      await clientes.update(1, datos);
      expect(ejecuto(/DELETE FROM CXC_CLIENTE_SEGMENTO/)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe('ruta.repository', () => {
  const nueva = { nombre: 'Ruta Centro', idSucursal: 2, idEmpleado: 7, fecha: '2026-10-28', estado: 'PLANIFICADA' as const, radioKm: 5 };

  it('create: código RUT-### consecutivo, observaciones vacías en vez de null y reintento por choque', async () => {
    const { conn, ejecuto } = conexion([
      { sql: /SELECT CODIGO_RUTA AS C/, rows: [{ C: 'RUT-009' }] },
      { sql: /INSERT INTO CXC_RUTAS/, outId: 4 },
    ]);
    fallar(conn, /INSERT INTO CXC_RUTAS/, oraUnico('UX_CXC_RUTAS_CODIGO'));
    await expect(rutas.create(nueva)).resolves.toBe(4);
    const ins = ejecuto(/INSERT INTO CXC_RUTAS/);
    expect(ins).toHaveLength(2);
    expect(ins[1].binds).toMatchObject({ codigoRuta: 'RUT-010', observaciones: '' });
  });

  describe('validarSucursalYEmpleado', () => {
    const reglas = (suc: unknown[], emp: unknown[]): Regla[] => [
      { sql: /FROM CXC_SUCURSALES/, rows: suc },
      { sql: /FROM EMPLEADO/, rows: emp },
    ];
    it.each([
      [[], [], 'idSucursal', /no existe/],
      [[{ ESTADO: 'I' }], [], 'idSucursal', /inactiva/],
      [[{ ESTADO: 'A' }], [], 'idEmpleado', /empleado seleccionado no existe/],
      [[{ ESTADO: 'A' }], [{ ID_SUCURSAL: null, NOMBRE: 'Luis Pérez' }], 'idEmpleado', /no tiene una sucursal/],
      [[{ ESTADO: 'A' }], [{ ID_SUCURSAL: 3, NOMBRE: 'Luis Pérez' }], 'idEmpleado', /otra sucursal/],
    ])('%o / %o → error en %s', async (suc, emp, campo, mensaje) => {
      conexion(reglas(suc, emp));
      const p = rutas.validarSucursalYEmpleado(2, 7);
      await expect(p).rejects.toThrow(mensaje);
      await expect(p).rejects.toMatchObject({ details: [{ campo }] });
    });
    it('empleado de la misma sucursal → válido', async () => {
      conexion(reglas([{ ESTADO: 'A' }], [{ ID_SUCURSAL: 2, NOMBRE: 'Luis' }]));
      await expect(rutas.validarSucursalYEmpleado(2, 7)).resolves.toBeUndefined();
    });
  });

  describe('update', () => {
    const reglas = (o: { ruta?: unknown[]; cobros?: number; paradas?: unknown[] } = {}): Regla[] => [
      { sql: /SELECT ESTADO, ID_EMPLEADO, RADIO_KM FROM CXC_RUTAS/, rows: o.ruta ?? [{ ESTADO: 'PLANIFICADA', ID_EMPLEADO: 7, RADIO_KM: 10 }] },
      { sql: /AS COBROS/, rows: [{ TOTAL: 2, PENDIENTES: 2, COBROS: o.cobros ?? 0 }] },
      { sql: /SELECT LATITUD, LONGITUD FROM CXC_RUTA_DETALLE/, rows: o.paradas ?? [] },
    ];
    it('estado manual → 409', () => expect(rutas.update(4, { estado: 'CANCELADA' })).rejects.toMatchObject({ statusCode: 409 }));
    it('ruta cerrada no se edita', async () => {
      conexion(reglas({ ruta: [{ ESTADO: 'COMPLETADA', ID_EMPLEADO: 7, RADIO_KM: 10 }] }));
      await expect(rutas.update(4, { nombre: 'Ruta Norte' })).rejects.toThrow(/cerrada/);
    });
    it('cambiar responsable: con cobros → 409; sin cobros pasa todas las paradas al nuevo', async () => {
      conexion(reglas({ cobros: 1 }));
      await expect(rutas.update(4, { idEmpleado: 8 })).rejects.toThrow(/cobros aplicados/);
      const { ejecuto } = conexion(reglas());
      await rutas.update(4, { idEmpleado: 8 });
      expect(ejecuto(/UPDATE CXC_RUTA_DETALLE SET ID_COBRADOR/)[0].binds).toEqual({ idEmpleado: 8, id: 4 });
    });
    it('reducir el radio no puede dejar fuera paradas ya asignadas', async () => {
      conexion(reglas({ paradas: [{ LATITUD: 14.6349, LONGITUD: -90.5069 }, { LATITUD: 14.68, LONGITUD: -90.5069 }] }));
      await expect(rutas.update(4, { radioKm: 2 })).rejects.toThrow(/no puede ser menor a 5\.\d km/);
    });
  });

  describe('finalizar', () => {
    const parada = (extra: Record<string, unknown>) => ({ ID_RUTA_DETALLE: 1, DOCUMENTO: 'FAC 10', CLIENTE: 'Ferretería', ESTADO_VISITA: 'VISITADO', TIENE_COBRO: 0, TIENE_NEGATIVA: 0, ...extra });
    const reglas = (estado: string, paradas: unknown[]): Regla[] => [
      { sql: /SELECT TRIM\(ESTADO\) AS ESTADO FROM CXC_RUTAS/, rows: [{ ESTADO: estado }] },
      { sql: /FROM CXC_RUTA_DETALLE d JOIN CXC_DOCUMENTOS doc/, rows: paradas },
    ];
    it('solo EN_PROCESO y con paradas', async () => {
      conexion(reglas('PLANIFICADA', []));
      await expect(rutas.finalizar(4)).rejects.toThrow(/EN_PROCESO/);
      conexion(reglas('EN_PROCESO', []));
      await expect(rutas.finalizar(4)).rejects.toThrow(/sin paradas/);
    });
    it.each([
      [{ ESTADO_VISITA: 'PENDIENTE' }, /pendiente de realizar/],
      [{ ESTADO_VISITA: 'REPROGRAMADO' }, /reprogramada/],
      [{ ESTADO_VISITA: 'NO_ENCONTRADO' }, /no encontrado/],
      [{ ESTADO_VISITA: 'VISITADO' }, /sin cobro confirmado ni pago denegado/],
    ])('parada sin resolver %o → 409 con el motivo', async (c, motivo) => {
      const { ejecuto } = conexion(reglas('EN_PROCESO', [parada(c)]));
      await expect(rutas.finalizar(4)).rejects.toThrow(motivo);
      expect(ejecuto(/SET ESTADO = 'COMPLETADA'/)).toHaveLength(0);
    });
    it('el mensaje se limita a 8 paradas', async () => {
      conexion(reglas('EN_PROCESO', Array.from({ length: 10 }, (_, i) => parada({ ID_RUTA_DETALLE: i, ESTADO_VISITA: 'PENDIENTE' }))));
      await expect(rutas.finalizar(4)).rejects.toThrow(/10 parada\(s\).*y 2 más/);
    });
    it('visitadas con cobro o negativa → COMPLETADA', async () => {
      const { conn, ejecuto } = conexion(reglas('EN_PROCESO', [parada({ TIENE_COBRO: 1 }), parada({ ID_RUTA_DETALLE: 2, TIENE_NEGATIVA: 1 })]));
      await rutas.finalizar(4);
      expect(ejecuto(/SET ESTADO = 'COMPLETADA'/)).toHaveLength(1);
      expect(conn.commit).toHaveBeenCalledOnce();
    });
  });

  describe('remove', () => {
    it('cerrada o con paradas → 409; vacía se elimina', async () => {
      conexion([{ sql: /SELECT ESTADO FROM CXC_RUTAS/, rows: [{ ESTADO: 'COMPLETADA' }] }]);
      await expect(rutas.remove(4)).rejects.toThrow(/historial/);
      conexion([{ sql: /SELECT ESTADO FROM CXC_RUTAS/, rows: [{ ESTADO: 'PLANIFICADA' }] }, { sql: /COUNT\(\*\) TOTAL FROM CXC_RUTA_DETALLE/, rows: [{ TOTAL: 0 }] }]);
      await rutas.remove(4);
    });
    it('OBSERVACIÓN: con paradas pide "cancélala", pero el estado no se puede cambiar a CANCELADA por ningún flujo', async () => {
      conexion([{ sql: /SELECT ESTADO FROM CXC_RUTAS/, rows: [{ ESTADO: 'PLANIFICADA' }] }, { sql: /COUNT\(\*\) TOTAL FROM CXC_RUTA_DETALLE/, rows: [{ TOTAL: 3 }] }]);
      await expect(rutas.remove(4)).rejects.toThrow(/cancélala/);
      await expect(rutaService.updateRuta(4, { estado: 'CANCELADA' })).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
