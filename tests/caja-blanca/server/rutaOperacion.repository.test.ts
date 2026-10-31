import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion, type Regla } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as repo from '../../../server/src/modules/cxc/repositories/organizacion/rutaOperacion.repository';

// 2026-10-27 12:00 hora de Guatemala (martes).
const HOY = '2026-10-27';
const MANANA = '2026-10-28';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const ruta = (extra: Record<string, unknown> = {}) => ({ ESTADO: 'PLANIFICADA', FECHA: MANANA, ID_EMPLEADO: 7, RADIO_KM: 5, ...extra });

function conexion(r: Regla[]) {
  const c = crearConexion(r);
  db.getConnection.mockResolvedValue(c.conn);
  return c;
}

// ---------------------------------------------------------------------------
describe('rutaOperacion.asignar — planificación de una parada', () => {
  const datos = (extra: Record<string, unknown> = {}) => ({
    idDocumento: 5, montoAsignado: 100, direccion: 'Zona 1', latitud: 14.6349, longitud: -90.5069, horaProgramada: '09:00', ubicacionConfirmada: true as const, ...extra,
  });
  const reglas = (o: { ruta?: unknown[]; paradas?: unknown[]; doc?: unknown[]; existe?: boolean; reservado?: number; elegible?: unknown[] } = {}): Regla[] => [
    { sql: /FROM CXC_RUTAS WHERE ID_RUTA=:idRuta FOR UPDATE/, rows: o.ruta ?? [ruta()] },
    // Pertenencia a la zona, convenio y promesa (misma consulta que la lista de documentos).
    { sql: /SELECT EN_ZONA, ZONA_CLIENTE FROM/, rows: o.elegible ?? [{ EN_ZONA: 1, ZONA_CLIENTE: 'Villa Canales - Zona 4' }] },
    { sql: /SELECT HORA_PROGRAMADA, LATITUD, LONGITUD FROM CXC_RUTA_DETALLE/, rows: o.paradas ?? [] },
    { sql: /SELECT ID_CLIENTE,SALDO,ESTADO FROM CXC_DOCUMENTOS/, rows: o.doc ?? [{ ID_CLIENTE: 1, SALDO: 300, ESTADO: 'PENDIENTE' }] },
    { sql: /SELECT ID_RUTA_DETALLE FROM CXC_RUTA_DETALLE WHERE ID_RUTA=:idRuta AND ID_DOCUMENTO/, rows: o.existe ? [{ ID_RUTA_DETALLE: 1 }] : [] },
    { sql: /RESERVADO FROM CXC_DOCUMENTOS d/, rows: [{ RESERVADO: o.reservado ?? 0 }] },
    { sql: /INSERT INTO CXC_RUTA_DETALLE/, outId: 60 },
  ];
  async function esperaError(r: Regla[], d: ReturnType<typeof datos>, esperado: RegExp | Record<string, unknown>) {
    const { conn, ejecuto } = conexion(r);
    const p = repo.asignar(4, d);
    await (esperado instanceof RegExp ? expect(p).rejects.toThrow(esperado) : expect(p).rejects.toMatchObject(esperado));
    expect(ejecuto(/INSERT INTO CXC_RUTA_DETALLE/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
  }

  it('ruta inexistente → 404', () => esperaError(reglas({ ruta: [] }), datos(), { statusCode: 404 }));
  it.each(['COMPLETADA', 'CANCELADA'])('ruta %s → 409', (ESTADO) => esperaError(reglas({ ruta: [ruta({ ESTADO })] }), datos(), /no está abierta/));
  it('ruta con fecha pasada → 409', () => esperaError(reglas({ ruta: [ruta({ FECHA: '2026-10-26' })] }), datos(), /cambia su fecha/));
  it.each(['06:59', '18:01'])('hora fuera de jornada (%s) → 400', (h) => esperaError(reglas(), datos({ horaProgramada: h }), /jornada del cobrador/));
  it('ruta de hoy con hora ya pasada → 400', () => esperaError(reglas({ ruta: [ruta({ FECHA: HOY })] }), datos({ horaProgramada: '11:30' }), /ya pasó/));
  it('menos de 20 minutos de otra parada → 400 sugiriendo hora libre', () =>
    esperaError(reglas({ paradas: [{ HORA_PROGRAMADA: '09:10', LATITUD: null, LONGITUD: null }] }), datos(), /20 minutos.*siguiente hora libre/));
  it('fuera del radio de la primera parada → 400', () =>
    esperaError(reglas({ paradas: [{ HORA_PROGRAMADA: '08:00', LATITUD: 14.6349, LONGITUD: -90.5069 }] }), datos({ latitud: 14.75 }), /máximo para esta ruta es 5 km/));
  it('documento inexistente → 404', () => esperaError(reglas({ doc: [] }), datos(), { statusCode: 404 }));
  it.each([[{ ESTADO: 'PAGADO' }], [{ SALDO: 0 }]])('documento sin cobro pendiente %o', (c) =>
    esperaError(reglas({ doc: [{ ID_CLIENTE: 1, SALDO: 300, ESTADO: 'PENDIENTE', ...c }] }), datos(), /no está pendiente de cobro/));
  it('documento ya asignado a la ruta → 409', () => esperaError(reglas({ existe: true }), datos(), /ya está asignado/));
  it('monto + lo ya reservado en otras rutas supera el saldo → 409', () => esperaError(reglas({ reservado: 250 }), datos(), /saldo disponible/));

  it('en convenio activo, con promesa vigente o ya en la ruta → 409', () =>
    esperaError(reglas({ elegible: [] }), datos(), /convenio activo|promesa de pago vigente/));
  it('cliente fuera de la zona sin marcar la excepción → 400 en el documento', () =>
    esperaError(reglas({ elegible: [{ EN_ZONA: 0, ZONA_CLIENTE: 'Amatitlán - Zona 2' }] }), datos(), { statusCode: 400, details: [{ campo: 'idDocumento' }] }));
  it('fuera de la zona con motivo: se asigna y queda en la bitácora', async () => {
    const { ejecuto } = conexion(reglas({ elegible: [{ EN_ZONA: 0, ZONA_CLIENTE: 'Amatitlán - Zona 2' }] }));
    await repo.asignar(4, datos({ fueraZona: true, motivoFueraZona: 'El cliente pidió la visita en su sucursal' }));
    expect(String(ejecuto(/INSERT INTO CXC_GESTIONES_COBRO/)[0].binds.texto)).toMatch(/FUERA DE ZONA: El cliente pidió/);
  });
  it('el punto confirmado queda como ubicación del cliente si no tenía', async () => {
    const { ejecuto } = conexion(reglas());
    await repo.asignar(4, datos());
    const merge = ejecuto(/MERGE INTO CXC_CLIENTE_UBICACION/)[0];
    expect(merge.sql).toMatch(/WHERE u.LATITUD IS NULL/);
    expect(merge.binds).toMatchObject({ idCliente: 1, latitud: 14.6349, longitud: -90.5069 });
  });

  it('éxito: la parada queda a cargo del responsable, se renumera y se deja gestión', async () => {
    const { conn, ejecuto } = conexion(reglas({ paradas: [{ HORA_PROGRAMADA: '08:00', LATITUD: 14.6349, LONGITUD: -90.5069 }] }));
    await repo.asignar(4, datos({ latitud: 14.64 }));
    expect(ejecuto(/INSERT INTO CXC_RUTA_DETALLE/)[0].binds).toMatchObject({ idCobrador: 7, idCliente: 1, montoAsignado: 100, horaProgramada: '09:00' });
    expect(ejecuto(/MERGE INTO CXC_RUTA_DETALLE/)).toHaveLength(1);
    expect(ejecuto(/INSERT INTO CXC_GESTIONES_COBRO/)[0].binds).toMatchObject({ idEmpleado: 7, idDetalle: 60 });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
describe('rutaOperacion.pendientes — documentos por zona', () => {
  it('por defecto solo la zona; con fueraZona todos; orden por zona, atraso y saldo', async () => {
    const { ejecuto } = conexion([{ sql: /ORDER BY EN_ZONA DESC/, rows: [{ ID_DOCUMENTO: 5, EN_ZONA: '1', DIAS_VENCIDO: '12' }] }]);
    const [d] = await repo.pendientes(361);
    expect(d).toMatchObject({ EN_ZONA: 1, DIAS_VENCIDO: 12 });
    await repo.pendientes(361, { fueraZona: true });
    const [solo, todos] = ejecuto(/ORDER BY EN_ZONA DESC/);
    expect(solo.binds).toMatchObject({ idRuta: 361, fueraZona: 0, hoy: HOY });
    expect(todos.binds.fueraZona).toBe(1);
    expect(solo.sql).toMatch(/ORDER BY EN_ZONA DESC, DIAS_VENCIDO DESC, SALDO DESC/);
  });
  it('excluye convenio activo, promesa vigente y documentos ya en la ruta', async () => {
    const { ejecuto } = conexion([]);
    await repo.pendientes(361);
    const sql = ejecuto(/ORDER BY EN_ZONA DESC/)[0].sql;
    expect(sql).toMatch(/CXC_CONVENIOS_PAGO cv .*'ACTIVO'/);
    expect(sql).toMatch(/CXC_PROMESAS_PAGO pp .*'PENDIENTE'.*pp.FECHA_COMPROMISO >= NVL\(TRUNC\(r.FECHA\)/);
    expect(sql).toMatch(/x.ID_RUTA=r.ID_RUTA AND x.ID_DOCUMENTO=d.ID_DOCUMENTO/);
  });
  it('pertenencia: misma zona, o todas las zonas del municipio si la ruta es de municipio completo; ruta sin zona = todos', async () => {
    const { ejecuto } = conexion([]);
    await repo.pendientes(361);
    const sql = ejecuto(/ORDER BY EN_ZONA DESC/)[0].sql;
    expect(sql).toMatch(/WHEN rz.ID_ZONA IS NULL THEN 1/);
    expect(sql).toMatch(/WHEN cz.ID_ZONA = rz.ID_ZONA THEN 1/);
    expect(sql).toMatch(/WHEN rz.ZONA IS NULL AND cz.ID_ZONA IS NOT NULL .*MUNICIPIO/);
  });
});

// ---------------------------------------------------------------------------
describe('rutaOperacion.registrar — bitácora del cobrador', () => {
  const reglas = (o: { ruta?: unknown[]; parada?: unknown[] } = {}): Regla[] => [
    { sql: /FROM CXC_RUTAS WHERE ID_RUTA=:idRuta FOR UPDATE/, rows: o.ruta ?? [ruta({ FECHA: HOY })] },
    { sql: /SELECT ID_CLIENTE, ID_DOCUMENTO, ID_COBRADOR FROM CXC_RUTA_DETALLE/, rows: o.parada ?? [{ ID_CLIENTE: 1, ID_DOCUMENTO: 5, ID_COBRADOR: 7 }] },
  ];
  const datos = (extra: Record<string, unknown> = {}) => ({ idAsignacion: 60, tipo: 'VISITA', observaciones: 'Cliente atendió la visita', ...extra }) as Parameters<typeof repo.registrar>[1];
  async function esperaError(r: Regla[], d: ReturnType<typeof datos>, mensaje: RegExp | Record<string, unknown>) {
    const { conn, ejecuto } = conexion(r);
    const p = repo.registrar(4, d);
    await (mensaje instanceof RegExp ? expect(p).rejects.toThrow(mensaje) : expect(p).rejects.toMatchObject(mensaje));
    expect(ejecuto(/INSERT INTO CXC_GESTIONES_COBRO/)).toHaveLength(0);
    expect(conn.rollback).toHaveBeenCalledOnce();
  }

  it('ruta futura → 409', () => esperaError(reglas({ ruta: [ruta({ FECHA: MANANA })] }), datos(), /a partir de ese día/));
  it('tipo no permitido → 400', () => esperaError(reglas(), datos({ tipo: 'PAGO' }), /no permitido/));
  it('sin observaciones → 400 en el campo', () => esperaError(reglas(), datos({ observaciones: '  ' }), { details: [{ campo: 'observaciones' }] }));
  it('reprogramación sin fecha, con fecha de hoy o en fin de semana → 400', async () => {
    await esperaError(reglas(), datos({ tipo: 'REPROGRAMACION' }), { details: [{ campo: 'nuevaFecha' }] });
    await esperaError(reglas(), datos({ tipo: 'REPROGRAMACION', nuevaFecha: HOY }), /posterior a hoy/);
    await esperaError(reglas(), datos({ tipo: 'REPROGRAMACION', nuevaFecha: '2026-10-31' }), /descanso/);
  });
  it('parada de otra ruta → 404', () => esperaError(reglas({ parada: [] }), datos(), /no pertenece a esta ruta/));

  it.each([
    ['VISITA', 'VISITA', 'VISITADO', true],
    ['NO_ENCONTRADO', 'VISITA', 'NO_ENCONTRADO', true],
    ['PAGO_DENEGADO', 'VISITA', 'VISITADO', true],
    ['INCIDENCIA', 'OTRO', null, false],
  ])('%s: gestión %s, parada %s, inicia ruta: %s', async (tipo, tipoGestion, estadoVisita, inicia) => {
    const { conn, ejecuto } = conexion(reglas());
    await repo.registrar(4, datos({ tipo }));
    expect(ejecuto(/INSERT INTO CXC_GESTIONES_COBRO/)[0].binds).toMatchObject({ tipo: tipoGestion, resultado: tipo, empleado: 7, nuevaFecha: null });
    const upd = ejecuto(/SET ESTADO_VISITA/);
    expect(upd.map((e) => e.binds.estado)).toEqual(estadoVisita ? [estadoVisita] : []);
    if (estadoVisita) expect(upd[0].binds.hora).toBe('12:00');
    expect(ejecuto(/SET ESTADO='EN_PROCESO'/)).toHaveLength(inicia ? 1 : 0);
    expect(ejecuto(/CXC_APLICACION_PAGOS|CXC_RECIBOS/)).toHaveLength(0);
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('reprogramación guarda la nueva fecha y no marca hora de visita', async () => {
    const { ejecuto } = conexion(reglas());
    await repo.registrar(4, datos({ tipo: 'REPROGRAMACION', nuevaFecha: MANANA }));
    expect(ejecuto(/INSERT INTO CXC_GESTIONES_COBRO/)[0].binds.nuevaFecha).toBe(MANANA);
    expect(ejecuto(/SET ESTADO_VISITA/)[0].binds).toMatchObject({ estado: 'REPROGRAMADO', hora: null });
  });
});

// ---------------------------------------------------------------------------
describe('rutaOperacion — perfil y documento asignado', () => {
  it('perfil: empleado inexistente → 404', async () => {
    const { conn } = conexion([]);
    conn.execute.mockResolvedValueOnce({ rowsAffected: 0 });
    await expect(repo.perfil(7, { telefono: '5555-1234', fotoUrl: '' })).rejects.toMatchObject({ statusCode: 404 });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
  it('perfil: actualiza y confirma', async () => {
    const { conn, ejecuto } = conexion([]);
    await repo.perfil(7, { telefono: '5555-1234', fotoUrl: '' });
    expect(ejecuto(/UPDATE EMPLEADO/)[0].binds).toEqual({ idEmpleado: 7, telefono: '5555-1234', fotoUrl: '' });
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('documentoAsignado: fuera de la ruta → 404; dentro devuelve documento y fecha', async () => {
    conexion([]);
    await expect(repo.documentoAsignado(4, 60)).rejects.toMatchObject({ statusCode: 404 });
    conexion([{ sql: /FROM CXC_RUTA_DETALLE d JOIN CXC_RUTAS r/, rows: [{ ID_DOCUMENTO: 5, FECHA_RUTA: HOY }] }]);
    await expect(repo.documentoAsignado(4, 60)).resolves.toEqual({ idDocumento: 5, fechaRuta: HOY });
  });
});
