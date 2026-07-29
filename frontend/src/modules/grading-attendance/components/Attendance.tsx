import { useShallow } from 'zustand/react/shallow';
import { useI18n } from "../../../infra/locales/I18nContext";
import useGradingAttendanceDefaultStore from '../store';
import { Status } from '../components/Status';
import { StudentList } from '../components/StudentList';
import { LessonTitle } from './LessonTitle';
import { LessonList } from '../components/LessonList';
import { btnSecondary, inputClass, selectClass } from '../attendance/Constants';
import AttendanceModal from './AttendanceModal';
import { UserResponse } from '../../../api/generated';
import { HiCog } from 'react-icons/hi2';
import StatusConfigurationModal from './StatusConfigurationModal';
export default function Attendance({ user, userId, permissions }: { user: UserResponse | null, userId: number, permissions: any }) {
    const {
        attendanceType, lessonTitle, selectedDate, selectedCourse, selectedLesson, attendanceStatusList, showAttendanceModal, showStatusConfigurationModal, courses,
        onDateChanged, onCourseChanged, onLessonChanged, onSearchLessonChanged, onShowStatusConfigurationChanged
    } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            attendanceType: s.attendanceType,
            lessonTitle: s.lessonTitle,
            selectedDate: s.selectedDate,
            selectedCourse: s.selectedCourse,
            selectedLesson: s.selectedLesson,
            attendanceStatusList: s.attendanceStatusList,
            showAttendanceModal: s.showAttendanceModal,
            showStatusConfigurationModal: s.showStatusConfigurationModal,
            courses: s.courses,
            onDateChanged: s.onDateChanged,
            onCourseChanged: s.onCourseChanged,
            onLessonChanged: s.onLessonChanged,
            onSearchLessonChanged: s.onSearchLessonChanged,
            onShowStatusConfigurationChanged: s.onShowStatusConfigurationChanged
        })));
    const { t } = useI18n();
    return (
        <div className="card px-6 py-5 h-full flex flex-col" style={{overflowX: 'auto'}}>
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex gap-3 flex-wrap">
                    <input type="date" className={inputClass} value={selectedDate} onChange={e => onDateChanged(e.target.value, userId)} />
                    {
                        attendanceType === 'class-attendance' &&
                        <select value={selectedCourse} disabled={selectedLesson !== '0'} onChange={e => onCourseChanged(e.target.value)} className={selectClass}>
                            {courses.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
                        </select>
                    }
                    {
                        attendanceType === 'class-attendance' &&
                        <input type="search" className={inputClass} placeholder="Search a Lesson . . ." onChange={e => onSearchLessonChanged(e.target.value)} />
                    }
                </div>
                <Status attendanceStatusList={attendanceStatusList} />
                {
                    permissions.has('attendance:approve') &&
                    <button title={t('attendance.statusConfiguration')} className={btnSecondary} onClick={() => onShowStatusConfigurationChanged(true)}>
                        <HiCog size={18} />
                    </button>
                }
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
            {{
                'daily-attendance': <StudentList userId={userId} />,
                'class-attendance': selectedLesson === "0" ?
                    <LessonList userId={userId} /> :
                    <>
                        <LessonTitle
                            lessonTitle={lessonTitle}
                            onLessonChanged={(lessonId) => onLessonChanged(lessonId, userId)}
                        />
                        <StudentList userId={userId} />
                    </>
            }[attendanceType]}
            </div>
            {showAttendanceModal && <AttendanceModal user={user} userId={userId} permissions={permissions} />}
            {showStatusConfigurationModal && <StatusConfigurationModal />}
        </div>
    )
}
