import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, Select, TextArea } from '../../../../shared/ui-kit';
import { FormActionButtons } from '../../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../../shared/api';
import {
  hasErrors,
  todayIso,
  validateIdentifier,
  validateMaxLength,
  validateMoney,
  validateRequiredDate,
  validateRequiredSelect,
  type ValidationErrors,
} from '../../../../shared/validation';
import type { CatalogoOption, NotaCredito } from '@erp/contracts';

const ESTADO_OPTIONS = [{ value: 'ACTIVA', label: 'Activa' }, { value: 'ANULADA', label: 'Anulada' }];
interface NotaCreditoFormProps { nota?: NotaCredito | null; onSuccess: () => void; onCancel: () => void; }

export const NotaCreditoForm = ({ nota, onSuccess, onCancel }: NotaCreditoFormProps) => {
  const isEditing = !!nota;
  const [clientes, setClientes] = useState<CatalogoOption[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoOption[]>([]);
  const [idCliente, setIdCliente] = useState(nota?.idCliente?.toString() ?? '');
  const [idDocumentoReferencia, setIdDocumentoReferencia] = useState(nota?.idDocumentoReferencia?.toString() ?? '');
  const [descripcion, setDescripcion] = useState(nota?.descripcion ?? '');
  const [serie, setSerie] = useState(nota?.serie ?? '');
  const [numero, setNumero] = useState(nota?.numero ?? '');
  const [fecha, setFecha] = useState(nota?.fecha?.slice(0, 10) ?? todayIso());
  const [monto, setMonto] = useState(nota?.monto?.toString() ?? '');
  const [estado, setEstado] = useState(nota?.estado ?? 'ACTIVA');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { apiClient.get<CatalogoOption[]>('/cxc/catalogos/clientes').then(setClientes).catch(() => setClientes([])); }, []);
  useEffect(() => {
    if (!idCliente) { setDocumentos([]); return; }
    apiClient.get<CatalogoOption[]>(`/cxc/catalogos/clientes/${idCliente}/documentos-pendientes`).then(setDocumentos).catch(() => setDocumentos([]));
  }, [idCliente]);

  const selectedDocumento = documentos.find((d) => String(d.id) === idDocumentoReferencia);
  const validate = (): ValidationErrors => {
    const next: ValidationErrors = {};
    const c = validateRequiredSelect(idCliente, 'un cliente'); if (c) next.idCliente = c;
    const s = validateIdentifier(serie, 'La serie'); if (s) next.serie = s;
    const n = validateIdentifier(numero, 'El número'); if (n) next.numero = n;
    const f = validateRequiredDate(fecha, 'La fecha', { notFuture: true }); if (f) next.fecha = f;
    const m = validateMoney(monto, 'El monto', { required: true, positive: true }); if (m) next.monto = m;
    if (!m && selectedDocumento?.saldo !== undefined && Number(monto) > selectedDocumento.saldo) next.monto = 'El monto no puede superar el saldo pendiente del documento seleccionado.';
    const d = validateMaxLength(descripcion, 'La descripción', 250); if (d) next.descripcion = d;
    return next;
  };
  const isFormValid = useMemo(() => !hasErrors(validate()), [idCliente, idDocumentoReferencia, serie, numero, fecha, monto, estado, descripcion, documentos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); const validationErrors = validate();
    if (hasErrors(validationErrors)) { setErrors(validationErrors); return; }
    setErrors({}); setFormError(null); setIsSubmitting(true);
    const payload = { idCliente: Number(idCliente), idDocumentoReferencia: idDocumentoReferencia ? Number(idDocumentoReferencia) : null, descripcion: descripcion.trim() || null, serie: serie.trim().toUpperCase() || null, numero: numero.trim().toUpperCase() || null, fecha, monto: Number(monto), estado: estado as 'ACTIVA' | 'ANULADA' };
    try {
      if (isEditing) await apiClient.patch(`/cxc/notas-credito/${nota!.idNotaCredito}`, payload); else await apiClient.post('/cxc/notas-credito', payload);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) { const fe: ValidationErrors = {}; (err.details as Array<{campo:string;mensaje:string}>).forEach((x) => fe[x.campo] = x.mensaje); setErrors(fe); }
      else setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar la nota de crédito');
    } finally { setIsSubmitting(false); }
  };

  return <form onSubmit={handleSubmit} className="flex flex-col gap-4">
    <Select label="Cliente" required value={idCliente} onChange={(e: any) => { setIdCliente(e.target.value); setIdDocumentoReferencia(''); }} options={clientes.map(c => ({ value:c.id, label:c.label }))} error={errors.idCliente} placeholder="Seleccionar cliente" helperText="Cliente al que se aplicará la nota de crédito." />
    <Select label="Documento de referencia" value={idDocumentoReferencia} onChange={(e: any) => setIdDocumentoReferencia(e.target.value)} options={documentos.map(d => ({ value:d.id, label:d.label }))} placeholder={idCliente ? 'Seleccionar documento (opcional)' : 'Selecciona un cliente primero'} isReadOnly={!idCliente} error={errors.idDocumentoReferencia} helperText="Opcional; solo se muestran documentos con saldo pendiente del cliente." />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TextInput label="Serie" restriction="identifier" uppercase maxLength={30} value={serie} onChange={(e:any)=>setSerie(e.target.value)} error={errors.serie} placeholder="Ej. NC" helperText="Código alfanumérico; admite -, _ y /." />
      <TextInput label="Número" restriction="identifier" uppercase maxLength={30} value={numero} onChange={(e:any)=>setNumero(e.target.value)} error={errors.numero} placeholder="Ej. 000001" helperText="Referencia alfanumérica de la nota; máximo 30 caracteres." />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TextInput label="Fecha" type="date" required max={todayIso()} value={fecha} onChange={(e:any)=>setFecha(e.target.value)} error={errors.fecha} helperText="Fecha real de emisión; no puede ser futura." />
      <TextInput label="Monto" type="number" restriction="decimal" decimalPlaces={2} step="0.01" min="0.01" required value={monto} onChange={(e:any)=>setMonto(e.target.value)} error={errors.monto} placeholder="0.00" helperText={selectedDocumento?.saldo !== undefined ? `Máximo según saldo del documento: ${selectedDocumento.saldo.toFixed(2)}.` : 'Monto positivo con máximo 2 decimales.'} />
    </div>
    <Select label="Estado" required value={estado} onChange={(e:any)=>setEstado(e.target.value)} options={ESTADO_OPTIONS} error={errors.estado} helperText="Una nota anulada no debe utilizarse en nuevas aplicaciones." />
    <TextArea label="Descripción" maxLength={250} helperText="Motivo o detalle de la nota de crédito (máx. 250 caracteres)." value={descripcion} onChange={(e:any)=>setDescripcion(e.target.value)} rows={3} error={errors.descripcion} placeholder="Motivo de la nota de crédito" />
    {formError && <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
    <FormActionButtons onCancel={onCancel} isSubmitting={isSubmitting} isEditing={isEditing} createLabel="Crear nota de crédito" isFormValid={isFormValid} />
  </form>;
};
