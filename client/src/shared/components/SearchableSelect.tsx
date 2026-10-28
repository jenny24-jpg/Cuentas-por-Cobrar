import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  label?: string;
  required?: boolean;
  error?: string;
  options?: SearchableSelectOption[];
  isReadOnly?: boolean;
  value?: string | number;
  /** Misma firma que Select: se invoca con un objeto tipo evento { target: { value } }. */
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  helperText?: string;
  className?: string;
  id?: string;
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Campo con búsqueda (escribes directamente, sin abrir una lista) para listas largas (clientes, documentos...).
 * Mantiene la API de Select del kit (value/onChange con target.value) para
 * poder intercambiarlos sin tocar la lógica de los formularios. Filtra sin
 * distinguir mayúsculas ni acentos y busca en todo el texto de la opción
 * (nombre, NIT, serie...).
 */
export function SearchableSelect({
  label,
  required = false,
  error,
  options = [],
  isReadOnly = false,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Escribe para buscar...',
  helperText,
  className = '',
  id,
}: SearchableSelectProps) {
  const reactId = useId().replace(/:/g, '');
  const baseId = id || `ss-${reactId}`;
  const listId = `${baseId}-list`;
  const errorId = `${baseId}-error`;
  const helpId = `${baseId}-help`;

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);

  const selected = options.find((o) => String(o.value) === String(value ?? ''));
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((o) => normalize(o.label).includes(q)) : options;
  }, [options, query]);

  const resolvedError =
    error ?? (touched && required && !isReadOnly && !selected
      ? `Debes seleccionar ${label ? label.toLowerCase() : 'una opción'}.`
      : undefined);
  const resolvedHelper =
    helperText ?? (label ? `Selecciona ${label.toLowerCase()}${required ? '; campo obligatorio' : ''}.` : undefined);

  const close = () => {
    setOpen(false);
    setQuery('');
    setTouched(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);

  const choose = (opt: SearchableSelectOption) => {
    onChange?.({ target: { value: String(opt.value) } });
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div ref={rootRef} className={`w-full flex flex-col gap-1.5 relative ${className}`}>
      {label && (
        <label htmlFor={baseId} className="text-xs font-semibold text-slate-700 flex items-center">
          {label}
          {required && <span className="text-red-500 ml-0.5" title="Campo requerido" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative flex items-center w-full">
        <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          ref={searchRef}
          id={baseId}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={isReadOnly}
          maxLength={100}
          value={open ? query : (selected?.label ?? '')}
          placeholder={open && selected ? selected.label : (selected ? '' : searchPlaceholder)}
          onFocus={() => setOpen(true)}
          onBlur={() => { if (open) close(); }}
          onClick={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          aria-invalid={Boolean(resolvedError) || undefined}
          aria-describedby={resolvedError ? errorId : resolvedHelper ? helpId : undefined}
          aria-activedescendant={open && filtered[active] ? `${baseId}-opt-${active}` : undefined}
          className={`w-full h-10 pl-9 ${selected && !required && !isReadOnly ? 'pr-9' : 'pr-3'} text-sm rounded-lg border transition-all duration-150 outline-none ${
            isReadOnly
              ? 'bg-slate-50 text-slate-600 border-slate-200 cursor-not-allowed font-medium'
              : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
          } ${resolvedError ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''}`}
        />
        {selected && !required && !isReadOnly && (
          <button
            type="button"
            aria-label="Quitar selección"
            onMouseDown={(e) => { e.preventDefault(); onChange?.({ target: { value: '' } }); setQuery(''); }}
            className="absolute right-2 h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">Sin resultados para “{query}”.</li>
            )}
            {filtered.map((opt, index) => {
              const isSelected = String(opt.value) === String(value ?? '');
              return (
                <li
                  key={`${opt.value}-${index}`}
                  id={`${baseId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    index === active ? 'bg-blue-50 text-blue-900' : 'text-slate-800'
                  } ${isSelected ? 'font-semibold' : ''}`}
                >
                  {opt.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {resolvedError && <span id={errorId} role="alert" className="text-xs text-red-600 font-medium">{resolvedError}</span>}
      {!resolvedError && resolvedHelper && <span id={helpId} className="text-xs text-slate-500 leading-relaxed">{resolvedHelper}</span>}
    </div>
  );
}
