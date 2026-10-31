import type { AplicacionPago, CatalogoOption, Pago, PaginatedResponse, Recibo } from '@erp/contracts';
import { apiClient } from '../api';
import { drawPdfFooters, newPdfDocument, pdfText } from './reportExport';
import logoSistemaUrl from '../../assets/brand/logo-cxc-light.png';

const money = (v: number) => `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Genera un comprobante detallado con los datos del pago y su aplicación confirmada. */
export async function downloadReciboPdf(recibo: Recibo): Promise<void> {
  const [pago, formas, aplicaciones] = await Promise.all([
    apiClient.get<Pago>(`/cxc/pagos/${recibo.idPago}`),
    apiClient.get<CatalogoOption[]>('/cxc/catalogos/formas-pago'),
    apiClient.get<PaginatedResponse<AplicacionPago>>(`/cxc/aplicaciones-pago?page=1&limit=100&search=${recibo.idPago}`),
  ]);
  const forma = formas.find((item) => item.id === pago.idFormaPago)?.label ?? `Forma de pago #${pago.idFormaPago}`;
  // El recibo automático se crea en la misma operación y con la misma fecha/monto
  // que su aplicación. Si hay coincidencias idénticas se omite el documento para no
  // atribuir al recibo una factura equivocada.
  const coincidencias = aplicaciones.data.filter((item) => item.idPago === pago.idPago
    && item.estado === 'CONFIRMADA'
    && item.fechaAplicacion.slice(0, 10) === recibo.fecha.slice(0, 10)
    && Math.abs(item.montoAplicado - recibo.monto) < 0.005);
  const aplicacion = coincidencias.length === 1 ? coincidencias[0] : null;

  const { doc, autoTable } = await newPdfDocument('portrait');
  const w = doc.internal.pageSize.getWidth();
  const left = 46;
  const right = w - left;
  const logo = new Image();
  logo.src = logoSistemaUrl;
  await logo.decode();
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, w, 116, 'F');
  doc.addImage(logo, 'PNG', left, 17, 126, 50);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RECIBO DE PAGO', 190, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(pdfText(recibo.numeroRecibo ?? `Recibo #${recibo.idRecibo}`), 190, 66);
  doc.text(`Emitido el ${fecha(recibo.fecha)}  |  Estado: ${recibo.estado}`, 190, 88);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DATOS DEL CLIENTE', left, 148);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(pdfText(recibo.nombreCliente || `Cliente #${recibo.idCliente}`), left, 168, { maxWidth: right - left });

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DETALLE DEL PAGO RECIBIDO', left, 204);
  autoTable(doc, {
    startY: 216,
    body: [
      ['Referencia del pago', pago.numeroReferencia || `Pago #${pago.idPago}`],
      ['Fecha en que se recibió', fecha(pago.fechaPago)],
      ['Forma de pago', forma],
      ...(pago.nombreBanco ? [['Banco', pago.nombreBanco]] : []),
      ['Monto total recibido', money(pago.monto)],
      ['Monto aplicado a este recibo', money(recibo.monto)],
      ['Saldo del pago aún no aplicado', money(Math.max(0, pago.monto - Number(pago.montoAplicado ?? recibo.monto)))],
    ],
    theme: 'grid',
    margin: { left, right: left },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 7, lineColor: [203, 213, 225], textColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 205, fontStyle: 'bold', textColor: [71, 85, 105] } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  if (aplicacion) {
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('¿A QUÉ DOCUMENTO SE APLICÓ?', left, y);
    autoTable(doc, {
      startY: y + 10,
      head: [['Documento', 'Fecha de aplicación', 'Importe aplicado']],
      body: [[aplicacion.referenciaDocumento || `Documento #${aplicacion.idDocumento}`, fecha(aplicacion.fechaAplicacion), money(aplicacion.montoAplicado)]],
      theme: 'grid',
      margin: { left, right: left },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 7, lineColor: [203, 213, 225], textColor: [30, 41, 59] },
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  } else {
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('El importe de este recibo corresponde a una aplicación confirmada del pago.', left, y, { maxWidth: right - left });
    y += 32;
  }

  if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); y = 58; }
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(left, y, right - left, 58, 6, 6, 'FD');
  doc.setTextColor(30, 64, 175);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL DE ESTE COMPROBANTE', left + 14, y + 22);
  doc.setFontSize(17);
  doc.text(money(recibo.monto), right - 14, y + 43, { align: 'right' });

  drawPdfFooters(doc, 'Comprobante interno de Cuentas por Cobrar · No es factura ni documento FEL/SAT');
  doc.save(`recibo-${recibo.numeroRecibo ?? recibo.idRecibo}.pdf`);
}
