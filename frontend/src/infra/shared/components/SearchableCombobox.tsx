import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SelectOption {
    id: string | number;
    value: string;
}

export interface SearchableComboboxProps {
    options: SelectOption[];
    placeholder?: string;
    onChange?: (selected: { id: string | number; value: string } | null) => void;
    onAddNew?: (value: string) => void;
    className?: string;
    forceUppercase?: boolean;
    selected? : { id?: string | number; value: string } | null;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────
export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
    options,
    placeholder = 'Search...',
    onChange,
    onAddNew,
    className = '',
    forceUppercase = false,
    selected = null
}) => {
    const [query, setQuery] = useState(selected ? selected.value : '');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Filter options
    const filteredOptions = useMemo(() => {
        const q = query.toLowerCase().trim();
        if (!q) return options;
        return options.filter(opt => opt.value.toLowerCase().includes(q));
    }, [options, query]);

    // Build navigable list (includes "Add New" when no matches)
    const showAddNew = onAddNew && filteredOptions.length === 0 && query.trim().length > 0;
    const navigableOptions = useMemo(() => {
        if (showAddNew) {
            return [...filteredOptions, { id: '__add_new__', value: query.trim() }];
        }
        return filteredOptions;
    }, [filteredOptions, showAddNew, query]);

    // Reset highlight when dropdown opens or list changes
    useEffect(() => {
        if (isOpen && navigableOptions.length > 0) {
            setHighlightedIndex(0);
        } else {
            setHighlightedIndex(-1);
        }
    }, [isOpen, navigableOptions.length]);

    // Auto-scroll highlighted item into view
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const activeItem = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
            activeItem?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Selection handlers
    const handleSelect = useCallback((option: SelectOption) => {
        setQuery(option.value);
        setIsOpen(false);
        setHighlightedIndex(-1);
        onChange?.({ id: option.id, value: option.value });
    }, [onChange]);

    const handleAddNew = useCallback(() => {
        const newValue = query.trim();
        if (newValue) {
            onAddNew?.(newValue);
            setIsOpen(false);
            setHighlightedIndex(-1);
            setQuery('');
            inputRef.current?.focus();
        }
    }, [query, onAddNew]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!isOpen || navigableOptions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % navigableOptions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + navigableOptions.length) % navigableOptions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0) {
                    const selected = navigableOptions[highlightedIndex];
                    if (selected.id === '__add_new__') {
                        handleAddNew();
                    } else {
                        handleSelect(selected);
                    }
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setHighlightedIndex(-1);
                inputRef.current?.blur();
                break;
            default:
                break;
        }
    }, [isOpen, navigableOptions, highlightedIndex, handleAddNew, handleSelect]);
    const wrapperClassName = `w-full px-4 py-2 text-sm bg-surface-2 border border-gray-300 rounded-lg shadow-sm \
                   focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 \
                   transition-all duration-200 placeholder:text-gray-400 ${forceUppercase ? 'uppercase' : ''}`
    return (
        <div ref={wrapperRef} className={`relative w-full ${className}`}>
            {/* Input */}
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(forceUppercase ? e.target.value.toUpperCase() : e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-activedescendant={isOpen && highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined}
                role="combobox"
                className={wrapperClassName}
            />

            {/* Dropdown */}
            {isOpen && (
                <ul
                    ref={listRef}
                    role="listbox"
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg 
                     max-h-60 overflow-auto py-1 animate-in fade-in slide-in-from-top-2 duration-200"
                >
                    {navigableOptions.map((opt, index) => (
                        <li
                            key={opt.id}
                            id={`option-${index}`}
                            data-index={index}
                            role="option"
                            aria-selected={index === highlightedIndex}
                            onClick={() => {
                                setHighlightedIndex(index);
                                if (opt.id === '__add_new__') handleAddNew();
                                else handleSelect(opt);
                            }}
                            className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${index === highlightedIndex
                                ? 'bg-blue-100 text-blue-800 font-medium'
                                : 'hover:bg-gray-50 text-gray-700'
                                } ${opt.id === '__add_new__' ? 'border-t border-gray-100 bg-blue-50/50' : ''}`}
                        >
                            {opt.id === '__add_new__' ? (
                                <span className="flex items-center gap-2">
                                    <PlusIcon />
                                    <span className="font-medium">Add</span>
                                    <span className="text-blue-600">&quot;{opt.value}&quot;</span>
                                    <span className="ml-auto text-xs text-blue-500/70">Press Enter</span>
                                </span>
                            ) : (
                                opt.value
                            )}
                        </li>
                    ))}

                    {filteredOptions.length === 0 && !showAddNew && (
                        <li className="px-4 py-3 text-sm text-gray-500 text-center">No results found</li>
                    )}
                </ul>
            )}
        </div>
    );
};