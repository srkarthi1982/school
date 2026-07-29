import { useState } from "react";
import useGradingAttendanceDefaultStore from "../store";
import { useShallow } from "zustand/react/shallow";
import { btnClose, btnPrimary, btnSecondary } from "../attendance/Constants";
import { useI18n } from "../../../infra/locales/I18nContext";
import { AttendanceStatusResponse } from "../../../api/generated";

const attendanceStatusInitital: AttendanceStatusResponse = {
    id: 0,
    code: '',
    name: '',
    created_at: '',
    updated_at: '',
    color: ''
}
export default function StatusConfigurationModal() {
    const { attendanceStatusList, onShowStatusConfigurationChanged, create, update, remove } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            attendanceStatusList: s.attendanceStatusList,
            onShowStatusConfigurationChanged: s.onShowStatusConfigurationChanged,
            create: s.postAttendanceStatus,
            update: s.putAttendanceStatus,
            remove: s.deleteAttendanceStatus
        })),
    )
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [modified, setModified] = useState(false);
    const [attendanceStatus, setAttendanceStatus] = useState(attendanceStatusInitital);
    const { t } = useI18n();
    const handleSubmit = async () => {
        setError(null);
        setSubmitting(true);
        try {
            if (attendanceStatus.id === 0) await create(attendanceStatus);
            else await update(attendanceStatus)
        } catch (err: any) {
            setError(err?.message || 'Failed to save attendance status');
        } finally {
            setSubmitting(false);
            setModified(false);
        }
    }
    const onDelete = async () => {
        try {
            setDeleting(true);
            await remove(attendanceStatus.id);
        } catch (err: any) {
            setError(err?.message || 'Failed to delete attendance status');
        } finally {
            setDeleting(false);
            setModified(false);
        }
    }
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => onShowStatusConfigurationChanged(false)}>
            <div className="bg-surface rounded-2xl border border-bd shadow-elevated w-[200] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}>
                    <div>
                        <p className="text-[13px] font-bold text-white">
                            {t('attendance.statusConfiguration')}
                        </p>
                    </div>
                    <button type="button" onClick={() => onShowStatusConfigurationChanged(false)} className={btnClose}>&times;</button>
                </div>
                {/* Body */}
                <div className="p-6 overflow-y-auto gap-2">
                    <div className="flex flex-col gap-2">
                        {
                            !modified ?
                                attendanceStatusList.length === 0 ? <div>Please add the status.</div> :
                                    attendanceStatusList.map(x => (
                                        <div key={x.id} onClick={() => { setModified(true); setAttendanceStatus(x) }} className="rounded-[8px] flex text-[14px] font-semibold p-4 bg-gray-100 text-[var(--text-muted)] w-[220px] hover:bg-gray-200 cursor-pointer transition-colors duration-200">
                                            <div key={x.id} className="flex items-center gap-1.5" role="listitem">
                                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: x.color || 'var(--text-muted)' }} />
                                                <span className="text-xs text-muted">{x.name}</span>
                                            </div>
                                        </div>
                                    )) :
                                <div className="flex flex-col w-[220px] space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Code</label>
                                    <input
                                        type="text"
                                        value={attendanceStatus.code}
                                        onChange={e => setAttendanceStatus({ ...attendanceStatus, code: e.target.value })}
                                        className="border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <label className="text-sm font-medium text-gray-700">Name</label>
                                    <input
                                        type="text"
                                        value={attendanceStatus.name}
                                        onChange={e => setAttendanceStatus({ ...attendanceStatus, name: e.target.value })}
                                        className="border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <label className="text-sm font-medium text-gray-700">Color</label>
                                    <input
                                        type="color"
                                        value={attendanceStatus.color || '#000000'}
                                        onChange={e => setAttendanceStatus({ ...attendanceStatus, color: e.target.value })}
                                        className="border rounded p-1 focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                        }
                    </div>
                </div>
                <div className="text-red">{error}</div>
                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    {
                        !modified ?
                            <>
                                <button type="button" onClick={() => { setModified(true); setAttendanceStatus(attendanceStatusInitital) }} className={btnPrimary}>{t('common.addNew')}</button>
                                <button type="button" onClick={() => onShowStatusConfigurationChanged(false)} className={btnSecondary}>{t('common.close')}</button>
                            </> :
                            <>
                                <button type="button" onClick={handleSubmit} className={btnPrimary} disabled={submitting}>{submitting ? 'Saving…' : t('common.save')}</button>
                                <button type="button" onClick={onDelete} className={btnSecondary}>{deleting ? 'Deleting…' : t('common.delete')}</button>
                                <button type="button" onClick={() => setModified(false)} className={btnSecondary}>{t('common.cancel')}</button>
                            </>
                    }
                </div>
            </div>
        </div>
    )
}