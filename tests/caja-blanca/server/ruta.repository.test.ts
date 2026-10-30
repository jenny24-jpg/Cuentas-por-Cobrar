import { describe, expect, it, vi } from 'vitest';
import { crearConexion } from '../helpers/fakeOracle';

const db = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../../server/src/config/database', () => db);

import * as rutas from '../../../server/src/modules/cxc/repositories/organizacion/ruta.repository';

describe('ruta.create — código de ruta', () => {
  it('bloquea la tabla antes de calcular el siguiente código y usa el correlativo real', async () => {
    const { conn, ejecuto } = crearConexion([
      { sql: /LOCK TABLE CXC_RUTAS IN EXCLUSIVE MODE WAIT 5/ },
      { sql: /SELECT MAX\(CASE WHEN REGEXP_LIKE\(CODIGO_RUTA/, rows: [{ ULTIMO: 7 }] },
      { sql: /INSERT INTO CXC_RUTAS/, outId: 12 },
    ]);
    db.getConnection.mockResolvedValue(conn);

    await expect(rutas.create({
      nombre: 'Ruta test',
      idEmpleado: 2,
      idSucursal: 1,
      fecha: '2026-11-06',
      radioKm: 8,
      observaciones: 'Sin observaciones',
    } as never)).resolves.toBe(12);

    expect(ejecuto(/LOCK TABLE CXC_RUTAS IN EXCLUSIVE MODE WAIT 5/)).toHaveLength(1);
    expect(ejecuto(/SELECT MAX\(CASE WHEN REGEXP_LIKE\(CODIGO_RUTA/)[0].sql).toContain('TO_NUMBER(SUBSTR(CODIGO_RUTA, 5))');
    expect(ejecuto(/INSERT INTO CXC_RUTAS/)[0].binds).toMatchObject({ codigoRuta: 'RUT-008' });
  });

  it('si otra transacción tiene la tabla bloqueada, responde con conflicto', async () => {
    const { conn } = crearConexion([]);
    conn.execute.mockRejectedValueOnce(Object.assign(new Error('ORA-30006: resource busy'), { errorNum: 30006 }));
    db.getConnection.mockResolvedValue(conn);

    await expect(rutas.create({
      nombre: 'Ruta test',
      idEmpleado: 2,
      idSucursal: 1,
      fecha: '2026-11-06',
      radioKm: 8,
      observaciones: 'Sin observaciones',
    } as never)).rejects.toThrow(/Otro usuario está registrando una ruta/);
  });
});
