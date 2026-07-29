import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-cyan-400/70 bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20 hover:bg-cyan-300',
  secondary:
    'border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
  ghost:
    'border-transparent bg-transparent text-slate-700 hover:bg-slate-100',
  danger:
    'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}


