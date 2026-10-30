import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearConexion } from '../helpers/fakeOracle';

const repo = vi.hoisted(() => ({
  getEmisor: vi.fn(), getCliente: vi.fn(), getMoneda: vi.fn(), getTipoFacturaId: vi.fn(), getDiasCredito: vi.fn(),
  emitir: vi.fn(), findAll: vi.fn(), findById: vi.fn(), anular: vi.fn(),
}));
const tareas = vi.hoisted(() => ({ recalcularPendientes: vi.fn(), cerrarVencidas: vi.fn(), recalcularIncumplidos: vi.fn() }));
vi.mock('../../../server/src/modules/cxc/repositories/facturacion/factura.repository', () => repo);
vi.mock('../../../server/src/modules/cxc/repositories/credito/mora.repository', () => ({ recalcularPendientes: tareas.recalcularPendientes }));
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/promesaPago.repository', () => ({ cerrarVencidas: tareas.cerrarVencidas }));
vi.mock('../../../server/src/modules/cxc/repositories/cobranza/convenioPago.repository', () => ({ recalcularIncumplidos: tareas.recalcularIncumplidos }));

import * as facturas from '../../../server/src/modules/cxc/services/facturacion/factura.service';
import { siguienteNumeroNotaCredito, siguienteNumeroDocumento } from '../../../server/src/modules/cxc/shared/correlativos';
import { programarTareasDiarias } from '../../../server/src/modules/cxc/shared/tareasDiarias';

const HOY = '2026-10-27';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Facturación FEL (certificador simulado): vencimiento según condición de crédito.
// ---------------------------------------------------------------------------
describe('factura.service', () => {
  const factura = (extra: Record<string, unknown> = {}) => ({
    idCliente: 1, idMoneda: 1, fechaEmision: HOY, idEmpleado: 2,
    lineas: [{ descripcion: 'Servicio de mantenimiento', cantidad: 1, precioUnitario: 112 }], ...extra,
  });
  beforeEach(() => {
    repo.getEmisor.mockResolvedValue({ idEmpresa: 1, nit: '1234567-9', nombre: 'Comercial Andina' });
    repo.getCliente.mockResolvedValue({ nombre: 'Ferretería Central', nit: '1234567-9', idCondicion: 3 });
    repo.getMoneda.mockResolvedValue({ codigo: 'GTQ' });
    repo.getTipoFacturaId.mockResolvedValue(81);
    repo.getDiasCredito.mockResolvedValue(30);
    repo.emitir.mockResolvedValue(11);
    repo.findById.mockResolvedValue({ idFactura: 11 });
  });

  it('validar y emitir exigen la fecha de hoy', async () => {
    await expect(facturas.validarFacturaSat(factura({ fechaEmision: '2026-10-26' }))).rejects.toThrow(/fecha actual/);
    await expect(facturas.emitirFactura(factura({ fechaEmision: '2026-10-28' }))).rejects.toThrow(/fecha actual/);
  });
  it('sin condición en la factura usa la del cliente (como Documentos)', async () => {
    const v = await facturas.validarFacturaSat(factura());
    expect(repo.getDiasCredito).toHaveBeenCalledWith(3);
    expect(v).toMatchObject({ valida: true, fechaVencimiento: '2026-11-26', total: 112, iva: 12, subtotalGravado: 100 });
  });
  it('condición explícita gana sobre la del cliente', async () => {
    repo.getDiasCredito.mockResolvedValue(15);
    const v = await facturas.validarFacturaSat(factura({ idCondicionCredito: 9 }));
    expect(repo.getDiasCredito).toHaveBeenCalledWith(9);
    expect(v.fechaVencimiento).toBe('2026-11-11');
  });
  it('cliente sin condición: contado (vence hoy)', async () => {
    repo.getCliente.mockResolvedValue({ nombre: 'X', nit: 'CF', idCondicion: null });
    const v = await facturas.validarFacturaSat(factura());
    expect(repo.getDiasCredito).not.toHaveBeenCalled();
    expect(v.fechaVencimiento).toBe(HOY);
  });
  it('condición inactiva → la SAT simulada la rechaza', async () => {
    repo.getDiasCredito.mockResolvedValue(null);
    const v = await facturas.validarFacturaSat(factura());
    expect(v.valida).toBe(false);
    await expect(facturas.emitirFactura(factura())).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.emitir).not.toHaveBeenCalled();
  });
  it('sin empresa emisora → rechazo', async () => {
    repo.getEmisor.mockResolvedValue(null);
    await expect(facturas.emitirFactura(factura())).rejects.toThrow(/empresa emisora/);
  });
  it('emitir guarda la condición resuelta y el vencimiento', async () => {
    await expect(facturas.emitirFactura(factura())).resolves.toEqual({ idFactura: 11 });
    expect(repo.emitir).toHaveBeenCalledWith(expect.objectContaining({ idCondicionCredito: 3, fechaVencimiento: '2026-11-26', total: 112, idTipoDocumento: 81 }));
    const { construirXml } = repo.emitir.mock.calls[0][0];
    expect(construirXml(1, `${HOY}T12:00:00`)).toContain('GTQ');
  });
  it('NIT receptor: usa el enviado, si no el del cliente, si no CF', async () => {
    repo.getCliente.mockResolvedValue({ nombre: 'Juan', nit: null, idCondicion: 3 });
    const v = await facturas.validarFacturaSat(factura());
    expect(v).toMatchObject({ nitReceptor: 'CF', nombreReceptor: 'Consumidor Final' });
  });
  it('listar, consultar y anular', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 });
    await facturas.listFacturas({ search: '  ' });
    expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined });
    await expect(facturas.getFactura(0)).rejects.toMatchObject({ statusCode: 400 });
    await facturas.anularFactura(11, { idEmpleadoAnulacion: 2, motivoAnulacion: 'Datos del receptor errados' });
    expect(repo.anular).toHaveBeenCalledWith(11, expect.any(String), expect.objectContaining({ idEmpleadoAnulacion: 2 }));
    repo.findById.mockResolvedValue(null);
    await expect(facturas.getFactura(11)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Correlativos: serie y número automáticos con bloqueo.
// ---------------------------------------------------------------------------
describe('correlativos', () => {
  const espera = Object.assign(new Error('ORA-30006'), { errorNum: 30006 });

  describe('siguienteNumeroNotaCredito', () => {
    it('sin tipo CREDITO activo → pide al DBA', async () => {
      const { conn } = crearConexion([]);
      await expect(siguienteNumeroNotaCredito(conn as never)).rejects.toThrow(/DBA/);
    });
    it('bloquea la tabla y suma uno al último número', async () => {
      const { conn, ejecuto } = crearConexion([
        { sql: /NATURALEZA = 'CREDITO'/, rows: [{ CODIGO: 'NC' }] },
        { sql: /MAX\(CASE/, rows: [{ ULTIMO: 6 }] },
      ]);
      await expect(siguienteNumeroNotaCredito(conn as never)).resolves.toEqual({ serie: 'NC', numero: '000007' });
      expect(ejecuto(/LOCK TABLE CXC_NOTAS_CREDITO/)).toHaveLength(1);
    });
    it('vista previa sin bloqueo; primera nota = 000001', async () => {
      const { conn, ejecuto } = crearConexion([{ sql: /NATURALEZA = 'CREDITO'/, rows: [{ CODIGO: 'NC' }] }]);
      await expect(siguienteNumeroNotaCredito(conn as never, { bloquear: false })).resolves.toEqual({ serie: 'NC', numero: '000001' });
      expect(ejecuto(/LOCK TABLE/)).toHaveLength(0);
    });
    it('tabla tomada por otro usuario → 409; otro error se propaga', async () => {
      for (const [error, esperado] of [[espera, { statusCode: 409 }], [new Error('ORA-00054'), { message: 'ORA-00054' }]] as const) {
        const { conn } = crearConexion([{ sql: /NATURALEZA = 'CREDITO'/, rows: [{ CODIGO: 'NC' }] }]);
        const original = conn.execute.getMockImplementation()!;
        conn.execute.mockImplementation(async (sql: string, b?: Record<string, unknown>) => {
          if (/LOCK TABLE/.test(sql)) throw error;
          return original(sql, b);
        });
        await expect(siguienteNumeroNotaCredito(conn as never)).rejects.toMatchObject(esperado);
      }
    });
  });

  describe('siguienteNumeroDocumento', () => {
    it('continúa la última serie de letras del tipo', async () => {
      const { conn, ejecuto } = crearConexion([
        { sql: /SELECT CODIGO FROM CXC_TIPOS_DOCUMENTO/, rows: [{ CODIGO: 'FAC ' }] },
        { sql: /SELECT SERIE FROM CXC_DOCUMENTOS/, rows: [{ SERIE: 'FACT' }] },
        { sql: /MAX/, rows: [{ ULTIMO: 139 }] },
      ]);
      const r = await siguienteNumeroDocumento(conn as never, 81);
      expect(r).toEqual({ serie: 'FACT', numero: '00000140' });
      expect(ejecuto(/FOR UPDATE WAIT 5/)).toHaveLength(1);
    });
    it('sin documentos previos usa el código del tipo; vista previa no bloquea', async () => {
      const { conn, ejecuto } = crearConexion([{ sql: /SELECT CODIGO FROM CXC_TIPOS_DOCUMENTO/, rows: [{ CODIGO: 'NDM' }] }]);
      await expect(siguienteNumeroDocumento(conn as never, 82, { bloquear: false })).resolves.toEqual({ serie: 'NDM', numero: '00000001' });
      expect(ejecuto(/FOR UPDATE/)).toHaveLength(0);
    });
    it('tipo inexistente → error "no encontrado"', async () => {
      const { conn } = crearConexion([]);
      await expect(siguienteNumeroDocumento(conn as never, 99)).rejects.toThrow(/no encontrado/);
    });
    it('fila del tipo tomada → 409', async () => {
      const { conn } = crearConexion([]);
      conn.execute.mockRejectedValueOnce(espera);
      await expect(siguienteNumeroDocumento(conn as never, 81)).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});

// ---------------------------------------------------------------------------
// Programador de tareas diarias: una vez por día de negocio, sin solaparse.
// ---------------------------------------------------------------------------
describe('programarTareasDiarias', () => {
  beforeEach(() => {
    tareas.recalcularPendientes.mockResolvedValue({ notasEmitidas: 0 });
    tareas.cerrarVencidas.mockResolvedValue(0);
    tareas.recalcularIncumplidos.mockResolvedValue(0);
  });

  it('corre al arrancar, no repite el mismo día y vuelve a correr al cambiar de día', async () => {
    const detener = programarTareasDiarias();
    await vi.advanceTimersByTimeAsync(0);
    expect(tareas.recalcularPendientes).toHaveBeenCalledTimes(1);
    expect(tareas.recalcularPendientes).toHaveBeenLastCalledWith(HOY);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(tareas.recalcularPendientes).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-28T07:00:00Z'));
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(tareas.recalcularPendientes).toHaveBeenCalledTimes(2);
    expect(tareas.recalcularPendientes).toHaveBeenLastCalledWith('2026-10-28');
    detener();
  });

  it('detener cancela las revisiones siguientes', async () => {
    const detener = programarTareasDiarias();
    await vi.advanceTimersByTimeAsync(0);
    detener();
    vi.setSystemTime(new Date('2026-10-29T18:00:00Z'));
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    expect(tareas.recalcularPendientes).toHaveBeenCalledTimes(1);
  });
});
