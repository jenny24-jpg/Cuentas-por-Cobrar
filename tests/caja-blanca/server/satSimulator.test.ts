import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calcularTotales,
  generarUuidAutorizacion,
  generarXmlDte,
  serieFelParaEmpresa,
  validarFactura,
  type ContextoValidacion,
} from '../../../server/src/modules/cxc/shared/satSimulator';

const base = (extra: Partial<ContextoValidacion> = {}): ContextoValidacion => ({
  emisor: { nit: '1234567-9', nombre: 'Empresa' },
  nitReceptor: '1234567-9',
  nombreReceptor: 'Cliente',
  fechaEmision: '2026-10-27',
  total: 100,
  tipoFacturaConfigurado: true,
  monedaValida: true,
  condicionValida: true,
  clienteExiste: true,
  ...extra,
});
const codigos = (ctx: ContextoValidacion) => validarFactura(ctx).errores.map((e) => e.codigo);

describe('calcularTotales (IVA 12% incluido)', () => {
  it('separa base e IVA y suma líneas', () => {
    const t = calcularTotales([
      { descripcion: 'A', cantidad: 2, precioUnitario: 56 },
      { descripcion: 'B', cantidad: 1, precioUnitario: 0.1 },
    ]);
    expect(t.lineas.map((l) => l.total)).toEqual([112, 0.1]);
    expect(t.total).toBe(112.1);
    expect(t.subtotalGravado).toBe(100.09);
    expect(t.iva).toBe(12.01);
  });
});

describe('validarFactura', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('factura correcta: sin errores ni advertencias', () => {
    expect(validarFactura(base())).toEqual({ errores: [], advertencias: [] });
  });
  it('emisor: no configurado, sin NIT, NIT inválido o CF', () => {
    expect(codigos(base({ emisor: null }))).toEqual(['EMISOR_NO_CONFIGURADO']);
    expect(codigos(base({ emisor: { nit: null, nombre: 'E' } }))).toEqual(['EMISOR_SIN_NIT']);
    expect(codigos(base({ emisor: { nit: '1234567-8', nombre: 'E' } }))).toEqual(['EMISOR_NIT_INVALIDO']);
    expect(codigos(base({ emisor: { nit: 'CF', nombre: 'E' } }))).toEqual(['EMISOR_NIT_INVALIDO']);
  });
  it('catálogos faltantes', () => {
    expect(codigos(base({ tipoFacturaConfigurado: false, clienteExiste: false, monedaValida: false, condicionValida: false })))
      .toEqual(['TIPO_DOCUMENTO_FACT', 'CLIENTE_NO_EXISTE', 'MONEDA_INVALIDA', 'CONDICION_INVALIDA']);
  });
  it('receptor: NIT vacío, inválido y nombre vacío', () => {
    expect(codigos(base({ nitReceptor: '' }))).toEqual(['NIT_RECEPTOR_REQUERIDO']);
    expect(codigos(base({ nitReceptor: '1234567-8' }))).toEqual(['NIT_RECEPTOR_INVALIDO']);
    expect(codigos(base({ nombreReceptor: '   ' }))).toEqual(['NOMBRE_RECEPTOR_REQUERIDO']);
  });
  it('Consumidor Final: advertencia y tope de monto', () => {
    expect(validarFactura(base({ nitReceptor: 'cf', total: 2500 })).advertencias).toHaveLength(1);
    expect(codigos(base({ nitReceptor: 'CF', total: 2500.01 }))).toEqual(['CF_EXCEDE_LIMITE']);
  });
  it('fecha futura y total excedido', () => {
    expect(codigos(base({ fechaEmision: '2026-10-28' }))).toEqual(['FECHA_FUTURA']);
    expect(codigos(base({ total: 10_000_000_000 }))).toEqual(['TOTAL_EXCEDIDO']);
  });
});

describe('datos del certificador', () => {
  it('UUID en mayúsculas y serie estable por empresa', () => {
    expect(generarUuidAutorizacion()).toMatch(/^[0-9A-F-]{36}$/);
    expect(serieFelParaEmpresa(1)).toBe(serieFelParaEmpresa(1));
    expect(serieFelParaEmpresa(1)).not.toBe(serieFelParaEmpresa(2));
    expect(serieFelParaEmpresa(1)).toMatch(/^[0-9A-F]{8}$/);
  });
  it('XML escapa caracteres especiales del receptor y descripciones', () => {
    const totales = calcularTotales([{ descripcion: 'Tornillos <3/8> & "tuercas"', cantidad: 1, precioUnitario: 11.2 }]);
    const xml = generarXmlDte({
      uuid: 'U', serie: 'S', numero: 1, fechaEmision: '2026-10-27', fechaCertificacion: '2026-10-27T10:00:00',
      moneda: 'GTQ', emisor: { nit: '12345679', nombre: "O'Brien" }, receptor: { nit: 'CF', nombre: 'A&B' }, totales,
    });
    expect(xml).toContain('Tornillos &lt;3/8&gt; &amp; &quot;tuercas&quot;');
    expect(xml).toContain('NombreEmisor="O&apos;Brien"');
    expect(xml).toContain('NombreReceptor="A&amp;B"');
    expect(xml).toContain('<dte:GranTotal>11.20</dte:GranTotal>');
    expect(xml).not.toMatch(/<[^>]*<3/);
  });
});
