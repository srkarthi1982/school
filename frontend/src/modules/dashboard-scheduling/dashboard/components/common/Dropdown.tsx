import type { SelectHTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';

type DropdownOption = {
  label: string;
  value: string;
};

type DropdownProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  options: DropdownOption[];
  hideLabel?: boolean;
};

export function Dropdown({
  className,
  hideLabel = false,
  id,
  label,
  options,
  ...props
}: DropdownProps) {
  const selectId = id ?? `dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span className={cn(hideLabel && 'sr-only')}>{label}</span>
      <select
        className={cn(
          'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20',
          className,
        )}
        id={selectId}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}


