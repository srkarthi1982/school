from pydantic import BaseModel


# ===================================================================
# Base entity responses
# ===================================================================

# ===================================================================
# Aggregated overview responses
# ===================================================================

class CourseStats(BaseModel):
    course_id: int
    course_name: str
    teacher_name: str
    color: str
    attendance_rate: float
    quiz_average: float
    survey_average: float
    form_average: float
    flight_average: float
    assessment_average: float
    materials_completed: int
    materials_total: int
    materials_completion_rate: float
    overall_progress: float
    lesson_completion_rate: float = 0.0

    model_config = {"from_attributes": True}


class TeacherCourseStats(BaseModel):
    course_id: int
    course_name: str
    teacher_name: str
    color: str
    student_count: int
    average_attendance_rate: float
    average_quiz_score: float
    average_survey_score: float
    average_form_score: float
    average_flight_score: float
    average_assessment_score: float
    average_materials_completion_rate: float
    low_performers: int
    lesson_completion_rate: float = 0.0
    start_date: str | None = None
    end_date: str | None = None

    model_config = {"from_attributes": True}
