import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../../infra/locales/I18nContext";
import { LessonResponse } from "../../../api/generated";
import useGradingAttendanceDefaultStore from "../store";
import { btnPrimary } from "../attendance/Constants";

export function LessonCard({ lesson, userId }: { lesson: LessonResponse, userId: number }) {
    const { t } = useI18n();
    const { onLessonChanged } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            onLessonChanged: s.onLessonChanged
        })),
    );
    return (
        <div className="card px-4 py-3.5">
            <p className="text-[12px] font-bold text-muted tracking-[0.07em] uppercase mb-1">{lesson?.lesson_number} <br /> {lesson?.title}</p>            
            <div className="flex flex-wrap mt-3">                
                <div style={{ flex: 1 }}></div>
                <button type="button" className={btnPrimary} onClick={() => onLessonChanged(lesson.id.toString(), userId)}>{t('attendance.room')}</button>
            </div>
        </div>
    )
}