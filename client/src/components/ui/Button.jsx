import React from 'react';

/**
 * Enterprise ERP Button Component
 * 
 * @param {Object} props
 * @param {'primary' | 'success' | 'danger' | 'secondary' | 'ghost'} [props.variant='primary']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {React.ElementType} [props.icon] - Lucide Icon component
 * @param {'left' | 'right'} [props.iconPosition='left']
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.fullWidth=false]
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 */
export const Button = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  fullWidth = false,
  children,
  className = '',
  type = 'button',
  onClick,
  ...props
}) => {
  // Height and padding specifications
  const sizeStyles = {
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-md font-medium',
    md: 'h-9 px-4 text-sm gap-2 rounded-lg font-medium',
    lg: 'h-11 px-5 text-base gap-2.5 rounded-xl font-semibold',
  };

  // Icon size mapping matching button scale
  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  // Color variants mapping enterprise palette rules
  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm focus:ring-blue-500',
    success: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm focus:ring-emerald-500',
    danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm focus:ring-red-500',
    secondary: 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 shadow-sm focus:ring-slate-400',
    ghost: 'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-600 hover:text-slate-900 focus:ring-slate-300',
  };

  const baseStyles = 'inline-flex items-center justify-center transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none select-none';

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${className}`}
      {...props}
    >
      {Icon && iconPosition === 'left' && (
        <Icon size={iconSizes[size]} className="shrink-0" />
      )}
      <span>{children}</span>
      {Icon && iconPosition === 'right' && (
        <Icon size={iconSizes[size]} className="shrink-0" />
      )}
    </button>
  );
};

export default Button;
