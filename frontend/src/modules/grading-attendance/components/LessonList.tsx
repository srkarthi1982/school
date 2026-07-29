import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../../infra/locales/I18nContext";
import useGradingAttendanceDefaultStore from "../store";
import { LessonCard } from "./LessonCard";

export function LessonList({ userId }: { userId: number }) {
    const { lessons } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            lessons: s.filteredLessons
        })),
    )
    const { t } = useI18n();
    return (
        <>
            <div className="grid grid-cols-4 gap-1.5">
                {
                    lessons.map(lesson => (
                        <div key={lesson.id} className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                            <LessonCard lesson={lesson} userId={userId} />
                        </div>
                    ))
                }
            </div>
            {
                lessons.length === 0 &&
                <div className="text-center font-semibold">{t('attendance.sectionsNotCreated')}</div>
            }
        </>
    )
}