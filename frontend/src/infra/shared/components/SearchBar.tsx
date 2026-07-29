import { useState } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";

export default function SearchBar({ placeholder = 'Search ...', onSearch = (_: string) => { } }) {
    const [search, setSearch] = useState<string>()

    return (
        <div className="relative flex-1 min-w-[180px]">
            <HiOutlineMagnifyingGlass className="absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); onSearch(e.target.value) }} placeholder={placeholder} className="w-full h-9 ps-9 pe-3 rounded-[9px] bg-[var(--surface-2)] text-primary text-3.4 font-sans outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-[border-color] duration-150" />
            {search && <button onClick={() => { setSearch(''); onSearch('') }} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"><HiOutlineXMark className="text-[15px]" /></button>}
        </div>
    )
}
