import { HiUser } from "react-icons/hi2"
import useGradingAttendanceDefaultStore from "../store"
import { useShallow } from "zustand/react/shallow"
import { useI18n } from "../../../infra/locales/I18nContext"

export function StudentList({ userId }: { userId: number }) {
    const { students, page, setPage, attendanceStatusList, onShowAttendanceChanged, onStudentChanged } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            students: s.students,
            page: s.page,
            setPage: s.setPage,
            attendanceStatusList: s.attendanceStatusList,
            onShowAttendanceChanged: s.onShowAttendanceChanged,
            onStudentChanged: s.onStudentChanged
        }))
    );
    const pageSize = 12;
    const { t } = useI18n();
    const totalPages = students.meta?.pages ?? 1;
    return (
        <div className="flex flex-col gap-6 flex-1 min-h-0">
            <div className="grid grid-cols-6 gap-1.5 content-start flex-1 min-h-0 overflow-auto thin-scrollbar-light">
                {
                    students.data.map((d) => {
                        const attendance = d.attendances?.length ? d.attendances[0] : null;
                        const level = attendance?.level || 0
                        const c = attendanceStatusList.find(x => x.id === (attendance?.status_id || 1));
                        return (
                            <div
                                key={d.id}
                                className="aspect-square rounded-[8px] flex items-center justify-center text-[14px] font-semibold hover: cursor-pointer"
                                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                                title={c?.name}
                                onClick={() => {
                                    onStudentChanged(d.id);
                                    onShowAttendanceChanged(true);
                                }}
                            >
                                <div className='flex flex-col items-center gap-2'>
                                    {d.photo ? (
                                        <img
                                            src={`data:image/jpeg;base64,${d.photo}`}
                                            alt="Student photo"
                                            className="w-24 h-24 object-cover rounded-full"
                                        />
                                    ) : (
                                        <HiUser size={100} />
                                    )}
                                    <div className='flex flex-wrap gap-2 items-center'><span className="w-3 h-3 rounded-full" style={{ background: c?.color || 'var(--text-muted)' }} /> {d.full_name}</div>
                                    {{
                                        3: <div className='text-xs text-yellow-500'>(Awaiting for Teacher)</div>,
                                        2: <div className='text-xs text-yellow-500'>(Awaiting for Admin)</div>,
                                        1: <div className='text-xs text-green-500'>(Approved)</div>
                                    }[level]}
                                </div>
                            </div>
                        )
                    })
                }
            </div>
            {
                students.data.length === 0 &&
                <div className="text-center font-semibold">{(t as any)('attendance.studentsNotEnrolled')}</div>
            }
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-2)] mt-auto shrink-0">
                <span className="text-3 text-muted">
                    {students.meta?.total === 0 ? '0 results' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, students.meta?.total ?? 0)} of ${students.meta?.total ?? 0}`}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        disabled={page === 0}
                        onClick={() => setPage(page - 1, userId)}
                        className="px-3 py-1 rounded-[9px] text-3 font-medium text-secondary border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {(t as any)('attendance.prev')}
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                        <button
                            key={i}
                            onClick={() => setPage(i, userId)}
                            className={`w-7 h-7 rounded-[9px] text-3 font-semibold transition-colors ${page === i ? 'bg-accent text-white' : 'text-secondary hover:bg-[var(--surface-2)]'}`}>
                            {i + 1}
                        </button>
                    ))}
                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage(page + 1, userId)}
                        className="px-3 py-1 rounded-[9px] text-3 font-medium text-secondary border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {(t as any)('attendance.next')}
                    </button>
                </div>
            </div>
        </div>
    )
}