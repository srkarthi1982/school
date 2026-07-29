from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class QuizGradingEntry(BaseModel):
    student_id: int
    quiz_id: Optional[int] = None
    question_id: int
    score: int
    note: Optional[str] = None


class BatchQuizGrading(BaseModel):
    grades: List[QuizGradingEntry]


class QuizGradeOut(BaseModel):
    id: int
    quiz_id: int
    student_id: int
    question_id: int
    score: int
    note: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class SurveyFormGradingEntry(BaseModel):
    student_id: int
    survey_id: Optional[int] = None
    form_id: Optional[int] = None
    question_id: int
    score: int
    note: Optional[str] = None


class BatchSurveyFormGrading(BaseModel):
    grades: List[SurveyFormGradingEntry]


class SurveyFormGradeOut(BaseModel):
    id: int
    survey_id: Optional[int] = None
    form_id: Optional[int] = None
    student_id: int
    question_id: int
    score: int
    note: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class ProgressEntry(BaseModel):
    student_id: int
    grading_type: str
    graded_count: int
    total_count: int
    progress_percent: int = 0


class CourseProgressResponse(BaseModel):
    course_name: str
    progress: List[ProgressEntry]


# ===========================================================================
# Quiz assignment with questions from course_selection
# ===========================================================================

class GradingQuizQuestion(BaseModel):
    question_id: int
    quiz_id: int
    question_text: str
    question_type: str
    weight: int
    choices: Optional[List[str]] = Field(default=None)
    grade: Optional[int] = Field(default=None)
    note: Optional[str] = Field(default=None)


class GradingQuizResponse(BaseModel):
    quiz_ids: List[int]
    questions: List[GradingQuizQuestion]


# ===========================================================================
# Survey assignment with questions from course_selection
# ===========================================================================

class GradingSurveyAnswerOption(BaseModel):
    id: int
    text: str
    weight: Optional[int] = Field(default=None)


class GradingSurveyQuestion(BaseModel):
    question_id: int
    survey_id: int
    question_text: str
    question_type: str
    weight: int
    allow_multiple: bool = False
    options: List[GradingSurveyAnswerOption] = Field(default_factory=list)
    grade: Optional[int] = Field(default=None)
    note: Optional[str] = Field(default=None)


class GradingSurveyResponse(BaseModel):
    survey_ids: List[int]
    questions: List[GradingSurveyQuestion]


# ===========================================================================
# Form assignment with questions from course_selection
# ===========================================================================

class GradingFormAnswerOption(BaseModel):
    id: int
    text: str
    weight: Optional[int] = Field(default=None)


class GradingFormQuestion(BaseModel):
    question_id: int
    form_id: int
    question_text: str
    question_type: str
    weight: int
    allow_multiple: bool = False
    options: List[GradingFormAnswerOption] = Field(default_factory=list)
    grade: Optional[int] = Field(default=None)
    note: Optional[str] = Field(default=None)


class GradingFormResponse(BaseModel):
    form_ids: List[int]
    questions: List[GradingFormQuestion]


# ===========================================================================
# Flight Pack Grading
# ===========================================================================

class FlightPackFillPayload(BaseModel):
    """Input for upserting a flight pack fill record."""
    course_instance_id: int
    student_id: int
    pack_id: int
    student_name: str
    rank: str
    date: str
    sortie_number: str
    sortie_detail: Optional[str] = None
    hour_day: str
    hour_night: str
    hour_nvg: str
    hour_total: str
    inst_simulated: str
    inst_actual: str
    inst_approaches: str
    inst_ils: str
    inst_vor: str
    grade_sortie: str
    grade_illum: str
    grade_weather: str


class FlightPackFillOut(BaseModel):
    """Flight pack fill record output."""
    pack_id: int
    student_name: str
    rank: str
    date: str
    sortie_number: str
    sortie_detail: Optional[str] = None
    hour_day: str
    hour_night: str
    hour_nvg: str
    hour_total: str
    inst_simulated: str
    inst_actual: str
    inst_approaches: str
    inst_ils: str
    inst_vor: str
    grade_sortie: str
    grade_illum: str
    grade_weather: str


class GradingFlightTaskGrade(BaseModel):
    """One task with its saved grade."""
    task_id: int
    task_no: str
    task_desc: str
    satisfied: Optional[bool] = None
    score: Optional[int] = None
    note: Optional[str] = None


class GradingFlightPackage(BaseModel):
    """One flight package with its tasks and grades."""
    pack_id: int
    name: str
    tasks: List[GradingFlightTaskGrade]


class GradingFlightPackagesOut(BaseModel):
    """All flight packages with fill data and grades for a course."""
    packages: List[GradingFlightPackage]
    fills: List[FlightPackFillOut]
    served_at: str


class FlightPackGradeEntry(BaseModel):
    """Individual task grade input."""
    student_id: int
    course_instance_id: int
    pack_id: int
    task_id: int
    satisfied: Optional[bool] = None
    score: Optional[int] = None
    note: Optional[str] = None


class FlightPackGradeOut(BaseModel):
    """Individual grade output."""
    id: int
    task_id: int
    pack_id: int
    satisfied: Optional[bool] = None
    score: Optional[int] = None
    note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


