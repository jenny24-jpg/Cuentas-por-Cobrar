import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * TextInput Component
 */
export const TextInput = ({
  label,
  required = false,
  error,
  icon: Icon,
  isReadOnly = false,
  placeholder = '',
  value,
  onChange,
  type = 'text',
  helperText,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 flex items-center">
          {label}
          {required && <span className="text-red-500 ml-0.5" title="Campo requerido">*</span>}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {Icon && (
          <div className="absolute left-3 pointer-events-none text-slate-400 flex items-center justify-center">
            <Icon size={16} />
          </div>
        )}

        <input
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          readOnly={isReadOnly}
          disabled={isReadOnly}
          placeholder={placeholder}
          className={`
            w-full h-10 px-3 text-sm rounded-lg border transition-all duration-150 outline-none
            ${Icon ? 'pl-9' : 'pl-3'}
            ${isReadOnly 
              ? 'bg-slate-50 text-slate-600 border-slate-200 cursor-not-allowed font-medium select-all' 
              : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'}
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-100 text-red-900' : ''}
          `}
          {...props}
        />
      </div>

      {error && (
        <span className="text-xs text-red-600 font-medium flex items-center gap-1">
          {error}
        </span>
      )}

      {!error && helperText && (
        <span className="text-xs text-slate-500">{helperText}</span>
      )}
    </div>
  );
};

/**
 * Select Dropdown Component
 */
export const Select = ({
  label,
  required = false,
  error,
  icon: Icon,
  options = [],
  isReadOnly = false,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  helperText,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-slate-700 flex items-center">
          {label}
          {required && <span className="text-red-500 ml-0.5" title="Campo requerido">*</span>}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {Icon && (
          <div className="absolute left-3 pointer-events-none text-slate-400 flex items-center justify-center">
            <Icon size={16} />
          </div>
        )}

        <select
          id={selectId}
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          className={`
            w-full h-10 px-3 pr-9 text-sm rounded-lg border appearance-none transition-all duration-150 outline-none
            ${Icon ? 'pl-9' : 'pl-3'}
            ${isReadOnly 
              ? 'bg-slate-50 text-slate-600 border-slate-200 cursor-not-allowed font-medium' 
              : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 cursor-pointer'}
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''}
          `}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt, index) => {
            const optVal = typeof opt === 'object' ? opt.value : opt;
            const optLabel = typeof opt === 'object' ? opt.label : opt;
            return (
              <option key={index} value={optVal}>
                {optLabel}
              </option>
            );
          })}
        </select>

        <div className="absolute right-3 pointer-events-none text-slate-400 flex items-center justify-center">
          <ChevronDown size={16} />
        </div>
      </div>

      {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
      {!error && helperText && <span className="text-xs text-slate-500">{helperText}</span>}
    </div>
  );
};

/**
 * TextArea Component
 */
export const TextArea = ({
  label,
  required = false,
  error,
  isReadOnly = false,
  rows = 3,
  placeholder = '',
  value,
  onChange,
  helperText,
  className = '',
  id,
  ...props
}) => {
  const areaId = id || (label ? `area-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={areaId} className="text-xs font-semibold text-slate-700 flex items-center">
          {label}
          {required && <span className="text-red-500 ml-0.5" title="Campo requerido">*</span>}
        </label>
      )}

      <textarea
        id={areaId}
        rows={rows}
        value={value}
        onChange={onChange}
        readOnly={isReadOnly}
        disabled={isReadOnly}
        placeholder={placeholder}
        className={`
          w-full px-3 py-2 text-sm rounded-lg border transition-all duration-150 outline-none resize-y
          ${isReadOnly 
            ? 'bg-slate-50 text-slate-600 border-slate-200 cursor-not-allowed font-medium' 
            : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'}
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-100 text-red-900' : ''}
        `}
        {...props}
      />

      {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
      {!error && helperText && <span className="text-xs text-slate-500">{helperText}</span>}
    </div>
  );
};

/**
 * Checkbox Component with HelperText underneath
 */
export const Checkbox = ({
  label,
  helperText,
  checked = false,
  onChange,
  disabled = false,
  required = false,
  className = '',
  id,
  ...props
}) => {
  const checkId = id || (label ? `check-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="flex items-center h-5 pt-0.5">
        <input
          id={checkId}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed accent-blue-600"
          {...props}
        />
      </div>
      <div className="flex flex-col text-sm">
        {label && (
          <label htmlFor={checkId} className="font-medium text-slate-900 cursor-pointer select-none">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        {helperText && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{helperText}</p>
        )}
      </div>
    </div>
  );
};
