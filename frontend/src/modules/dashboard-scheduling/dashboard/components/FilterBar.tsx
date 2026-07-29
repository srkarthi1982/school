import type { ReactNode } from 'react';

import { Dropdown } from './common';

type FilterOption = {
  label: string;
  value: string;
};

type FilterConfig = {
  label: string;
  value: string;
  options: FilterOption[];
  onChange?: (value: string) => void;
};

type FilterBarProps = {
  filters: FilterConfig[];
  actions?: ReactNode;
};

export function FilterBar({ actions, filters }: FilterBarProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
      {filters.map((filter) => (
        <div className="min-w-0" key={filter.label}>
          <Dropdown
            label={filter.label}
            onChange={(event) => filter.onChange?.(event.target.value)}
            options={filter.options}
            value={filter.value}
          />
        </div>
      ))}
      {actions &&
        <div className='flex items-end'>
          {actions}
        </div>}
    </div>
  );
}


