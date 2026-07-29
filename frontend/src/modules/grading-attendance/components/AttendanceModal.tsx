import { useState } from "react";
import useGradingAttendanceDefaultStore from "../store";
import { useShallow } from "zustand/react/shallow";
import { btnClose, btnPrimary, btnSecondary, selectClass } from "../attendance/Constants";
import { useI18n } from "../../../infra/locales/I18nContext";
import { HiUser } from "react-icons/hi2";
import { UserResponse } from "../../../api/generated";
export default function AttendanceModal({ user, userId, permissions }: { user: UserResponse | null, userId: number, permissions: any }) {
    const { selectedDate, selectedStudent, selectedLesson, students, attendanceStatusList, onShowAttendanceChanged, postAttendance, putAttendance, deleteAttendance  } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            selectedDate: s.selectedDate,
            selectedLesson: s.selectedLesson,
            students: s.students,
            selectedStudent: s.selectedStudent,
            attendanceStatusList: s.attendanceStatusList,
            onShowAttendanceChanged: s.onShowAttendanceChanged,
            postAttendance: s.postAttendance,
            putAttendance: s.putAttendance,
            deleteAttendance: s.deleteAttendance,
        })),
    )
    const { t } = useI18n();
    const student = students.data.find(x => x.id === Number(selectedStudent));
    const attendanceId = student?.attendances?.length && student.attendances[0].id;
    const locked = student?.attendances?.length && student.attendances[0].locked;
    const currentStatus = student?.attendances?.length && student.attendances[0].status_id;
    const [status, setStatus] = useState(currentStatus || 1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit() {
        setError(null);
        setSubmitting(true);
        let level = permissions.has('attendance:approve') ? 1 : permissions.has('attendance:verify') ? 2 : permissions.has('attendance:write') ? 3 : 0;
        try {
            onShowAttendanceChanged(false);
            if (attendanceId) {
                if (status === 1) await deleteAttendance(attendanceId, userId);
                else await putAttendance(attendanceId, Number(student?.id), Number(selectedLesson), selectedDate, status, level === 1, level, user?.id || 0, userId);
            }
            else await postAttendance(Number(student?.id), Number(selectedLesson), selectedDate, status, level === 1, level, user?.id || 0, userId);
        } catch (err: any) {
            setError(err?.message || 'Failed to save attendance');
        } finally {
            setSubmitting(false);
        }
    }
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => onShowAttendanceChanged(false)}>
            <div className="bg-surface rounded-2xl border border-bd shadow-elevated w-[200] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}>
                    <div>
                        <p className="text-[13px] font-bold text-white">
                            {t('attendance.attendance')}
                        </p>
                    </div>
                    <button type="button" onClick={() => onShowAttendanceChanged(false)} className={btnClose}>&times;</button>
                </div>
                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    <div
                        className="aspect-square rounded-[8px] flex items-center justify-center text-[14px] font-semibold"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', width: 220 }}
                        title={'present'}
                    >
                        <div className='flex flex-col items-center gap-2'>
                            {student?.photo ? (
                                <img
                                    src={`data:image/jpeg;base64,${student.photo}`}
                                    alt="Student photo"
                                    className="w-24 h-24 object-cover rounded-full"
                                />
                            ) : (
                                <HiUser size={100} />
                            )}
                            <div className='flex flex-wrap gap-2 items-center'>{student?.full_name}</div>                            
                            <select className={selectClass} value={status} onChange={e => setStatus(Number(e.target.value))} disabled={userId > 0}>
                                {
                                    attendanceStatusList.map(x => (
                                        <option key={x.id} value={x.id}>{x.name}</option>
                                    ))
                                }
                            </select>
                        </div>
                    </div>
                </div>
                <div className="text-red">{error}</div>
                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button type="button" onClick={() => onShowAttendanceChanged(false)} className={btnSecondary}>{t('common.cancel')}</button>
                    {
                        (permissions.has('attendance:write') || permissions.has('attendance:verify') || permissions.has('attendance:approve')) &&
                        <button type="button" onClick={handleSubmit} disabled={(locked && user?.roles.includes('HOS')) || submitting} className={btnPrimary}>
                            {
                                submitting ? t('attendance.saving') :
                                    (attendanceId && permissions.has('attendance:verify')) ? t('attendance.verify') :
                                        (attendanceId && permissions.has('attendance:approve')) ? t('attendance.approve') : t('common.save')
                            }
                        </button>
                    }
                </div>
            </div>
        </div>
    )
}