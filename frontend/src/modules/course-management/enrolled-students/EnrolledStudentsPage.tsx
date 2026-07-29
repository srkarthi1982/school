import { useEffect, useMemo, useState } from "react";
import useCourseManagementDefaultStore, { StudentProfile } from "../store";
import { useShallow } from "zustand/react/shallow";
import StudentList from "../components/StudentList";
import SectionHeader from "../../../infra/shared/components/SectionHeader";
import { HiUserGroup } from "react-icons/hi2";
import useAuthStore, { selectUser, selectUserPermissions } from "../../../infra/auth/useAuthStore";
import { useI18n } from "../../../infra/locales/I18nContext";


function ViewBasicInfoModal({ user, onClose }: { user: StudentProfile, onClose: () => void }) {
    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        // Overlay
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            {/* Container */}
            <div className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Title */}
                <div
                    className="px-4 py-4 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}>
                    <div>
                        <p className="text-sm font-bold text-white uppercase">{user.fullName}</p>
                    </div>
                    <button className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer" onClick={() => onClose()}>&times;</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Date of Birth</label>
                        <input className={inputClass} value={user.dateOfBirth?.toString() ?? ''} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Country</label>
                        <input className={inputClass} value={user.country ?? ''} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Rank</label>
                        <input className={inputClass} value={user.rank} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Qualification</label>
                        <input className={inputClass} value={user.qualification ?? ''} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Primary Platform</label>
                        <input className={inputClass} value={user.primaryPlatform ?? ''} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Email</label>
                        <input className={inputClass} value={user.email} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Mobile No</label>
                        <input className={inputClass} value={user.mobileNo ?? ''} readOnly />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Ext No</label>
                        <input className={inputClass} value={user.extNo ?? ''} readOnly />
                    </div>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button
                        type="button"
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    )
}

export default function EnrolledStudentsPage2() {
    const { students, listMyClassmates } = useCourseManagementDefaultStore(useShallow(s => ({ students: s.students, listMyClassmates: s.listMyClassmates })))
    const [selectedStudent, setSelectedStudent] = useState<StudentProfile>();
    const activeUser = useAuthStore(selectUser);
    const permissions = useAuthStore(selectUserPermissions)
    const { t } = useI18n();

    const isAdmin = useMemo(() => permissions.has('admin:full'), [permissions])


    useEffect(() => {
        (async () => {
            await listMyClassmates();
        })();
    }, [])
    return (
        <div className="flex flex-col h-full min-h-0 gap-0">
            <div className="flex flex-col h-full flex-1  min-w-0 overflow-y-auto thin-scrollbar-light gap-3">
                <SectionHeader icon={<HiUserGroup />} title={isAdmin ? t('nav.courseManagement.enrolledStudents.title') : "My Classmates"} />
                <StudentList students={students} onStudentSelected={setSelectedStudent} />
                {selectedStudent && <ViewBasicInfoModal user={selectedStudent} onClose={() => setSelectedStudent(undefined)} />}
            </div>
        </div>


    )
}