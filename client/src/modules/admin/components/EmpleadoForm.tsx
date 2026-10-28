import React, { useMemo, useState } from 'react';
import { empleadoSchema, type EmpleadoAdmin } from '@erp/contracts';
import { TextInput, Select } from '../../../shared/ui-kit';
import { FormActionButtons } from '../../../shared/components/FormActionButtons';
import { apiClient, ApiError } from '../../../shared/api';
import { hasErrors, type ValidationErrors } from '../../../shared/validation';

/**
 * Alta y edición de empleados. Las reglas vienen del mismo esquema compartido que
 * valida el servidor. Un empleado no se elimina: se inactiva, porque sus registros
 * históricos (pagos, gestiones, ajustes...) siguen apuntando a él.
 */
export function EmpleadoForm({ item, onSaved, onCancel }: {
  item?: EmpleadoAdmin | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(item);
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [apellido, setApellido] = useState(item?.apellido ?? '');
  const [puesto, setPuesto] = useState(item?.puesto ?? '');
  const [codigo, setCodigo] = useState(item?.codigo ?? '');
  const [email, setEmail] = useState(item?.email ?? '');
  const [telefono, setTelefono] = useState(item?.telefono ?? '');
  const [estado, setEstado] = useState<string>(item?.estado ?? 'A');
  const [serverErrors, setServerErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});

  const validationErrors = useMemo<ValidationErrors>(() => {
    const parsed = empleadoSchema.safeParse({ nombre, apellido, puesto, codigo, email, telefono, estado });
    const next: ValidationErrors = {};
    if (!parsed.success) parsed.error.issues.forEach((i) => { const k = String(i.path[0]); if (!next[k]) next[k] = i.message; });
    if (!nombre.trim()) next.nombre = 'El nombre es obligatorio.';
    return next;
  }, [nombre, apellido, puesto, codigo, email, telefono, estado]);

  const isFormValid = !hasErrors(validationErrors);
  const marcar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));
  const errorDe = (campo: string) => serverErrors[campo] ?? (tocados[campo] ? validationErrors[campo] : undefined);
  const limpiar = (campo: string) => setServerErrors((s) => { if (!s[campo]) return s; const { [campo]: _omit, ...resto } = s; return resto; });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isFormValid) {
      setTocados({ nombre: true, apellido: true, puesto: true, codigo: true, email: true, telefono: true });
      return;
    }
    setServerErrors({});
    setBusy(true);
    const payload = { nombre: nombre.trim(), apellido: apellido.trim(), puesto: puesto.trim(), codigo: codigo.trim(), email: email.trim(), telefono: telefono.trim(), estado };
    try {
      if (isEditing) await apiClient.patch(`/admin/usuarios/empleados/${item!.idEmpleado}`, payload, { successMessage: 'Empleado actualizado correctamente.' });
      else await apiClient.post('/admin/usuarios/empleados', payload, { successMessage: 'Empleado creado correctamente.' });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details)) {
        const x: ValidationErrors = {};
        (err.details as Array<{ campo: string; mensaje: string }>).forEach((d) => { x[d.campo] = d.mensaje; });
        setServerErrors(x);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el empleado.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Nombre" required maxLength={120} value={nombre}
          onChange={(e: any) => { setNombre(e.target.value); limpiar('nombre'); }} onBlur={() => marcar('nombre')} error={errorDe('nombre')}
          helperText="Nombres de pila, por ejemplo: José Fernando." />
        <TextInput label="Apellido" maxLength={120} value={apellido}
          onChange={(e: any) => { setApellido(e.target.value); limpiar('apellido'); }} onBlur={() => marcar('apellido')} error={errorDe('apellido')}
          helperText="Apellidos, por ejemplo: López Reyes." />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Puesto" maxLength={100} value={puesto}
          onChange={(e: any) => { setPuesto(e.target.value); limpiar('puesto'); }} onBlur={() => marcar('puesto')} error={errorDe('puesto')}
          helperText="Cargo, por ejemplo: Cobrador." />
        <TextInput label="Código" maxLength={30} value={codigo}
          onChange={(e: any) => { setCodigo(e.target.value.replace(/\s/g, '')); limpiar('codigo'); }} onBlur={() => marcar('codigo')} error={errorDe('codigo')}
          helperText={isEditing ? 'Código único del empleado.' : 'Déjalo vacío y el sistema asigna el siguiente (CXC-EMP-###).'} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Correo electrónico" type="email" maxLength={150} value={email}
          onChange={(e: any) => { setEmail(e.target.value); limpiar('email'); }} onBlur={() => marcar('email')} error={errorDe('email')} />
        <TextInput label="Teléfono" maxLength={30} value={telefono}
          onChange={(e: any) => { setTelefono(e.target.value); limpiar('telefono'); }} onBlur={() => marcar('telefono')} error={errorDe('telefono')} />
      </div>
      {isEditing && (
        <Select label="Estado" required value={estado} onChange={(e: any) => { setEstado(e.target.value); limpiar('estado'); }}
          options={[{ value: 'A', label: 'Activo' }, { value: 'I', label: 'Inactivo' }]}
          helperText="Un empleado inactivo no aparece para vincular a usuarios. Para inactivarlo no debe tener un usuario vinculado."
          error={serverErrors.estado} />
      )}

      {formError && <p role="alert" className="text-sm text-red-600 font-medium">{formError}</p>}

      <FormActionButtons
        onCancel={onCancel}
        isSubmitting={busy}
        isEditing={isEditing}
        isFormValid={isFormValid}
        blockers={validationErrors}
        createLabel="Crear empleado"
        confirmTitle={isEditing ? 'Confirmar cambios' : 'Confirmar nuevo empleado'}
        confirmMessage={isEditing ? '¿Guardar los cambios de este empleado?' : '¿Crear este empleado?'}
      />
    </form>
  );
}
