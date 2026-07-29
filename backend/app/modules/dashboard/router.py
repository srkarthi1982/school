from fastapi import APIRouter, Depends
from .schemas import DashboardSummaryResponse, DashboardResponse, DashboardFilterState
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from sqlalchemy import select, func, distinct
from app.modules.course_info.models import MasterAircraftType, MasterSimulatorType
from app.modules.course_selection_material.models import CourseSelectionMaterialFile, CourseSelectionMaterialUserProgress
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.profile.models import Profile
from app.modules.course.models import CourseEnrollment, CourseInstance, course_instructors
from app.modules.attendance.models import Attendance
from app.modules.attendance_status.models import AttendanceStatus
from app.modules.it_support.models import Ticket
from .leadership import (
    get_active_learners,
    get_usage_volume,
    get_course_health,
    get_support_response,
    get_completion_rate,
    get_attendance_rate,
    get_average_score,
    get_active_courses_section,
    get_completed_courses_section,
    get_student_pass_fail_rate_section,
    get_training_delays_section,
    get_flight_simulator_hours_section,
    get_weak_students_section,
    get_material_effectiveness_section,
    get_evaluation_compliance_section,
    get_course_completion_rate_section,
    get_repeated_weak_lessons_section,
    get_api_export_readiness_section,
)
from app.modules.quiz_bank.models import QuizAttempt
from app.modules.course_selection_schedule.lesson_content_models import CourseSelectionLessonRelease
from app.modules.class_session.models import ClassSession
from app.modules.course_selection_info.models import CourseSelectionInfoLessonCreationLesson
from app.modules.course.router import list_personnel_courses

from .filters import get_filter_options, get_filters
from .instructor import (
  get_live_sessions_card,
  get_instructor_workload_section,
  get_feedback_speed,
  get_active_instructors_strip,
  get_lessons_delivered_strip,
  get_completion_strip,
  get_today_schedule_item,
  get_pending_attendance_item,
  get_pending_evaluations_item,
  get_weak_students_by_lesson_item,
  get_students_missing_material_item,
  get_quiz_results_item,
  get_upcoming_flight_bookings_item,
  get_external_instructor_coordination_alerts_item,
  get_course_progress_status_item
)
from .student import (
    get_student_course_schedule_item,
    get_student_materials_item,
    get_student_completed_lessons_item,
    get_student_pending_quizzes_item,
    get_student_weak_lessons_item,
    get_student_review_material_item,
    get_student_limited_evaluation_feedback_item,
    get_student_course_progress_item,
    get_student_study_streak_item,
    get_student_usage_volume_card,
    get_student_goal_progress_item,
    get_student_completion_strip,
    get_student_average_score_strip,
    get_student_usage_rate_strip,
)
from .sat import (
    get_sat_courses_by_version_item,
    get_sat_lesson_duration_issues_item,
    get_sat_materials_needing_update_item,
    get_sat_repeated_weak_quiz_lessons_item,
    get_sat_evaluation_item_weakness_trends_item,
    get_sat_course_structure_gaps_item,
    get_sat_feedback_trends_item,
    get_sat_courses_requiring_revision_item,
    get_sat_active_candidates_card,
    get_sat_usage_volume_card,
    get_sat_practice_completion_card,
    get_sat_practice_completion_trend_card,
    get_sat_pass_rate_strip,
    get_sat_pending_reviews_strip,
    get_sat_average_score_strip
)
from .kpis import get_kpi_categories, get_api_export_kpis

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
  
from .common import (
    get_alerts,
    get_week_lessons,
    get_risk_statuses,
    get_pending_actions,
    get_export_readiness,
)

def get_leadership(db: Session = Depends(get_db), user: "User" = Depends(get_current_user), params: DashboardFilterState = Depends()):
    """
    Return the full dashboard information for the leadership view.
    """
    return {
        "filterOptions": get_filter_options(db=db, user=user, params=params),
        "dashboardInfo": {
            "card1": get_active_learners(db, params),
            "card2": get_usage_volume(db, params),
            "card3": get_course_health(db, params),
            "card4": get_support_response(db, params),
            "strip1": get_completion_rate(db, params),
            "strip2": get_attendance_rate(db, params),
            "strip3": get_average_score(db, params),
            "alerts": get_alerts(db),            
            "details": {
                "kpiCategories": get_kpi_categories(db, user, params),
                "riskStatuses": get_risk_statuses(db, params),
                "weakLessons": get_week_lessons(db, params),
                "pendingActions": get_pending_actions(db, params),
                "exportReadiness": get_export_readiness(db, params),
                "coverageSections": [
                    {
                        "id": "leadership-pdf-coverage",
                        "title": "Activities",
                        "items": [
                            get_active_courses_section(db, params),
                            get_completed_courses_section(db, params),
                            get_student_pass_fail_rate_section(db, params),
                            get_training_delays_section(db, params),
                            get_flight_simulator_hours_section(db, params),
                            get_weak_students_section(db, params),
                            get_material_effectiveness_section(db, params),
                            get_evaluation_compliance_section(db, params),
                            get_course_completion_rate_section(db, params),
                            get_instructor_workload_section(db, params),
                            get_repeated_weak_lessons_section(db, params),
                            get_api_export_readiness_section(db, params),
                        ]
                    },
                ]
            },
        },
        "filters": params.dict(),
    }
    
def get_sat(db: Session = Depends(get_db), user: "User" = Depends(get_current_user), params: DashboardFilterState = Depends()):
    """
    Return the full dashboard information for the sat view.
    """
    return {
        "filterOptions": get_filter_options(db=db, user=user, params=params),
        "dashboardInfo": {
            "card1": get_sat_active_candidates_card(db, params),
            "card2": get_sat_usage_volume_card(db, params),
            "card3": get_sat_practice_completion_card(db, params),
            "card4": get_sat_practice_completion_trend_card(db, params),
            "strip1": get_sat_pass_rate_strip(db, params),
            "strip2": get_sat_pending_reviews_strip(db, params),
            "strip3": get_sat_average_score_strip(db, params),
            "alerts": get_alerts(db),
            "details": {
                "kpiCategories": get_kpi_categories(db, user, params),
                "riskStatuses": get_risk_statuses(db, params),
                "weakLessons": get_week_lessons(db, params),
                "pendingActions": get_pending_actions(db, params),
                "exportReadiness": get_export_readiness(db, params),
                "coverageSections": [
                    {
                        "id": "sat-001",
                        "title": "Activities",
                        "items": [
                            get_sat_courses_by_version_item(db, params),
                            get_sat_lesson_duration_issues_item(db, params),
                            get_sat_materials_needing_update_item(db, params),
                            get_sat_repeated_weak_quiz_lessons_item(db, params),
                            get_sat_evaluation_item_weakness_trends_item(db, params),
                            get_sat_course_structure_gaps_item(db, params),
                            get_sat_feedback_trends_item(db, params),
                            get_sat_courses_requiring_revision_item(db, params)
                        ]
                    },
                ]
            },
        },
        "filters": params.dict(),
    }
        
def get_instructor(db: Session = Depends(get_db), user: "User" = Depends(get_current_user), params: DashboardFilterState = Depends()):
    """
    Return the full dashboard information for the instructor view.
    """
    return {
      "filterOptions": get_filter_options(db=db, user=user, params=params),
      "dashboardInfo": {
        "card1": get_live_sessions_card(db, user, params),
        "card2": get_usage_volume(db, params),
        "card3": get_instructor_workload_section(db, params),
        "card4": get_feedback_speed(db, params),
        "strip1": get_active_instructors_strip(db, params),
        "strip2": get_lessons_delivered_strip(db, params),
        "strip3": get_completion_strip(db, params),
        "alerts": get_alerts(db),
        "details": {
            "kpiCategories": get_kpi_categories(db, user, params),
            "riskStatuses": get_risk_statuses(db, params),
            "weakLessons": get_week_lessons(db, params),
            "pendingActions": get_pending_actions(db, params),
            "exportReadiness": get_export_readiness(db, params),
            "coverageSections": [
                {
                    "id": "instructor-pdf-coverage",
                    "title": "Activities",
                    "items": [
                        get_today_schedule_item(db, params),
                        get_pending_attendance_item(db, params),
                        get_pending_evaluations_item(db, params),
                        get_weak_students_by_lesson_item(db, params),
                        get_students_missing_material_item(db, params),
                        get_upcoming_flight_bookings_item(db, params),
                        get_external_instructor_coordination_alerts_item(db, params),
                        get_course_progress_status_item(db, params),
                    ]
                },
            ]
        },
      },
      "filters": params.dict(),
    }

def get_student(db: Session = Depends(get_db), user: "User" = Depends(get_current_user), params: DashboardFilterState = Depends()):
    """
    Return the full dashboard information for the student view.
    """
    return {
        "filterOptions": get_filter_options(db=db, user=user, params=params),
        "dashboardInfo": {
            "card1": get_student_study_streak_item(db, user, params),
            "card2": get_student_usage_volume_card(db, params),
            "card3": get_student_goal_progress_item(db, user, params),
            "card4": get_student_goal_progress_item(db, user, params),
            "strip1": get_student_completion_strip(db, user, params),
            "strip2": get_student_average_score_strip(db, user, params),
            "strip3": get_student_usage_rate_strip(db, user, params),
            "alerts": get_alerts(db),
            "details": {
                "kpiCategories": get_kpi_categories(db, user, params),
                "riskStatuses": get_risk_statuses(db, params),
                "weakLessons": get_week_lessons(db, params),
                "pendingActions": get_pending_actions(db, params),
                "exportReadiness": get_export_readiness(db, params),
                "coverageSections": [
                    {
                        "id": "student-001",
                        "title": "Activities",
                        "items": [
                            get_student_course_schedule_item(db, user, params),
                            get_student_materials_item(db, user, params),
                            get_student_completed_lessons_item(db, user, params),
                            get_student_pending_quizzes_item(db, user, params),
                            get_student_weak_lessons_item(db, user, params),
                            get_student_review_material_item(db, user, params),
                            get_student_limited_evaluation_feedback_item(db, user, params),
                            get_student_course_progress_item(db, user, params),
                        ]                        
                    },
                ]
            },
        },
        "filters": params.dict(),
    }
    
@router.get("/info", response_model=DashboardResponse)
def get_info(db: Session = Depends(get_db), user: "User" = Depends(get_current_user), params: DashboardFilterState = Depends()):
    """
    Return generic dashboard information based on the report_type filter.
    """
    if params.report_type == "leadership":
        return get_leadership(db, user, params)
    elif params.report_type == "sat":
        return get_sat(db, user, params)
    elif params.report_type == "instructor":
        return get_instructor(db, user, params)
    elif params.report_type == "student":
        return get_student(db, user, params)
    else:
        # Fallback to leadership view
        return get_leadership(db, user, params)