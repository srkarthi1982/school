import { useCallback, useMemo, useState } from "react";
import { HiMiniChevronUpDown, HiOutlineChevronDown, HiOutlineChevronUp } from "react-icons/hi2";
import { StudentProfile } from "../store";
import SearchBar from "../../../infra/shared/components/SearchBar";
import Paginator2 from "../../../infra/shared/components/Paginator2";

type SortKey = 'fullName' | 'rank' | 'qualification' | 'primaryPlatform' | 'mobileNo' | 'attendanceStatus'
type AttendanceStatus = 'PRESENT' | 'ABSENT'

const STATUS_MAP: Record<AttendanceStatus, { label: string; bg: string; text: string }> = {
    PRESENT: { bg: 'rgba(34,197,94,0.15)', text: '#16A34A', label: 'Present' },
    ABSENT: { bg: 'rgba(220,38,38,0.12)', text: '#DC2626', label: 'Absent' },
};


export default function StudentList({ onStudentSelected, students }: { students: StudentProfile[], onStudentSelected?: (selectedStudent: StudentProfile) => void }) {
    const [searchText, setSearchText] = useState<string>('')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [sortKey, setSortKey] = useState<SortKey>('fullName');
    const [page, setPage] = useState<number>(0)

    const PAGE_SIZE = 12

    const filteredData = useMemo(() => {
        const result = students.filter(p => p.fullName.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.rank.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.qualification?.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.primaryPlatform?.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.mobileNo?.toLocaleLowerCase().includes(searchText.toLocaleLowerCase())
        )
        setPage(0)
        return result.sort((a, b) => {
            const cmp = (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '')
            return sortDir == 'asc' ? cmp : -cmp
        })

    }, [searchText, sortKey, sortDir, students])

    const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

    const paginatedRows = useMemo(() => filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredData, page])

    const toggleSort = useCallback((col: SortKey) => {
        setSortKey(col)
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    }, [])

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <HiMiniChevronUpDown className="text-[14px] text-muted opacity-50" />;
        return sortDir === 'asc' ? <HiOutlineChevronUp className="text-[12px] text-accent" /> : <HiOutlineChevronDown className="text-[12px] text-accent" />;
    };

    return (
        <div className="flex flex-col gap-2 h-full">
            <SearchBar onSearch={setSearchText} />
            <div className="flex flex-col card p-0 overflow-auto h-full">
                <div className="overflow-x-auto h-full">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                                {
                                    [
                                        { key: 'fullName', label: 'Name' },
                                        { key: 'rank', label: 'Rank' },
                                        { key: 'qualification', label: 'Qualification' },
                                        { key: 'primaryPlatform', label: 'Platform' },
                                        { key: 'mobileNo', label: 'Mobile No' },
                                        { key: 'attendanceStatus', label: 'Attendance Status', className: 'flex justify-center' }
                                    ].map(k => (
                                        <th key={`header-${k.key}`} className={`px-4 py-3 text-[11px] font-bold text-muted tracking-[0.06em] uppercase ${k.className ?? ''}`}>
                                            <button onClick={() => toggleSort(k.key as SortKey)} className={`flex items-center gap-1 hover:text-primary transition-colors uppercase`}>{k.label}<SortIcon col={k.key as SortKey} /></button>
                                        </th>
                                    ))
                                }
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.map((s, i) => (
                                <tr key={s.id} className={i > 0 ? 'border-t border-[var(--border)] hover:bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'} style={{borderBottom:`1px solid rgba(0,0,0,0.1)`}}>
                                    <td className="px-4 py-3.5 text-[13.5px] font-semibold text-primary">
                                        <label className=" cursor-pointer" onClick={() => {
                                            if (onStudentSelected) {
                                                onStudentSelected(filteredData.filter(p => p.id === s.id)[0])
                                            }

                                        }}>{s.fullName}</label>
                                    </td>
                                    <td className="px-4 py-3.5 text-[12.5px] text-secondary whitespace-nowrap">{s.rank}</td>
                                    <td className="px-4 py-3.5 text-[12.5px] text-secondary whitespace-nowrap">{s.qualification}</td>
                                    <td className="px-4 py-3.5 text-[12.5px] text-secondary">{s.primaryPlatform}</td>
                                    <td className="px-4 py-3.5 text-[12.5px] text-secondary">{s.mobileNo}</td>
                                    <td className="px-4 py-3.5 text-center">
                                        <span
                                            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                                            style={{
                                                background: STATUS_MAP[s.attendanceStatus as AttendanceStatus].bg,
                                                color: STATUS_MAP[s.attendanceStatus as AttendanceStatus].text,
                                            }}
                                        >
                                            {STATUS_MAP[s.attendanceStatus as AttendanceStatus].label}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Paginator2 page={page} totalPages={totalPages} onPageChanged={setPage} dataLength={filteredData.length} pageSize={PAGE_SIZE} />
            </div>
        </div>
    )
}