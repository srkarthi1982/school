import React, { memo } from "react";
import { HiArrowLeft } from "react-icons/hi2";

interface LessonTitleProps {
  lessonTitle: string;  
  onLessonChanged: (lessonId: string, ...rest: any[]) => void | Promise<void>;
}
export const LessonTitle = memo(function LessonTitle({ lessonTitle, onLessonChanged }: LessonTitleProps): React.ReactElement {
    return (
        <div className="flex gap-3 flex-wrap mb-3 mt-3">
            <button type="button" onClick={() => onLessonChanged("0")} className="cursor-pointer" aria-label="Go back to lessons">
                <HiArrowLeft className="text-xl" />
            </button>
            <p className="text-base font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                {lessonTitle}
            </p>
        </div>
    );
});