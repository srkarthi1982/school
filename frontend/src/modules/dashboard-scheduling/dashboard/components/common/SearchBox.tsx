import type { InputHTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';

type SearchBoxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

export function SearchBox({ className, id, label, ...props }: SearchBoxProps) {
  const inputId = id ?? `search-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 rounded-full border border-slate-400 before:absolute before:-bottom-1 before:-end-1 before:h-1.5 before:w-px before:rotate-[-45deg] before:bg-slate-400"
      />
      <input
        className={cn(
          'h-10 w-full rounded-md border border-slate-300 bg-white py-2 pe-3 ps-10 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20',
          className,
        )}
        id={inputId}
        type="search"
        {...props}
      />
    </label>
  );
}


