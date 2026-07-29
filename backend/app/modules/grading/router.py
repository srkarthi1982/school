import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.users.models import User
from app.modules.survey.schemas import StudentResponseResponse
from app.modules.form.schemas import FormStudentResponseResponse
from app.modules.course.guards import (
    ensure_course_not_stopped,
    ensure_form_not_stopped,
    ensure_quiz_not_stopped,
    ensure_survey_not_stopped,
)

from . import schemas
from . import services

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/grading", tags=["Grading"])


# ===========================================================================
# Quiz Grading
# ===========================================================================

@router.post("/quiz-grades", response_model=SuccessResponse[schemas.QuizGradeOut])
def save_quiz_grade(
    payload: schemas.QuizGradingEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload.quiz_id:
        raise HTTPException(status_code=400, detail="quiz_id is required")
    ensure_quiz_not_stopped(db, payload.quiz_id)

    try:
        grade = services.upsert_quiz_grade(
            db=db,
            quiz_id=payload.quiz_id,
            student_id=payload.student_id,
            question_id=payload.question_id,
            score=payload.score,
            note=payload.note,
        )
        db.commit()
        return ok(grade)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quiz-grades/batch", response_model=SuccessResponse[list[schemas.QuizGradeOut]])
def batch_save_quiz_grades(
    payload: schemas.BatchQuizGrading,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload.grades:
        raise HTTPException(status_code=400, detail="Grades list is required")
    for entry in payload.grades:
        ensure_quiz_not_stopped(db, entry.quiz_id)

    results = []
    try:
        for entry in payload.grades:
            if not entry.quiz_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"quiz_id required for question {entry.question_id}",
                )
            grade = services.upsert_quiz_grade(
                db=db,
                quiz_id=entry.quiz_id,
                student_id=entry.student_id,
                question_id=entry.question_id,
                score=entry.score,
                note=entry.note,
            )
            results.append(grade)

        db.commit()
        return ok(results)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/quiz-grades/{quiz_id}",
    response_model=SuccessResponse[list[schemas.QuizGradeOut]],
)
def get_quiz_grades(
    quiz_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    grades = services.get_quiz_grades(db, quiz_id, student_id)
    return ok(grades)


@router.get(
    "/quiz/{quiz_id}/attempt",
)
def get_student_quiz_attempt(
    quiz_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    from app.modules.quiz_bank.models import QuizAttempt
    result = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
    ).filter(
        QuizAttempt.student_id == student_id
    ).order_by(QuizAttempt.id.desc()).first()
    if result:
        data = {
            "id": result.id,
            "quiz_id": result.quiz_id,
            "student_id": result.student_id,
            "score": result.score,
            "max_score": result.max_score,
            "has_essay": result.has_essay,
            "answers": result.answers,
            "submitted_at": result.submitted_at.isoformat() if result.submitted_at else None,
        }
        return ok(data)
    return ok({})


# ===========================================================================
# Survey Grading
# ===========================================================================

@router.put("/survey-grades", response_model=SuccessResponse[schemas.SurveyFormGradeOut])
def save_survey_grade(
    payload: schemas.SurveyFormGradingEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload.survey_id:
        raise HTTPException(status_code=400, detail="survey_id is required")
    ensure_survey_not_stopped(db, payload.survey_id)

    try:
        grade = services.upsert_survey_grade(
            db=db,
            survey_id=payload.survey_id,
            student_id=payload.student_id,
            question_id=payload.question_id,
            score=payload.score,
            note=payload.note,
        )
        db.commit()
        return ok(grade)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/survey-grades/batch",
    response_model=SuccessResponse[list[schemas.SurveyFormGradeOut]],
)
def batch_save_survey_grades(
    payload: list[schemas.SurveyFormGradingEntry],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload:
        raise HTTPException(status_code=400, detail="Grades list is required")
    for entry in payload:
        ensure_survey_not_stopped(db, entry.survey_id)

    results = []
    try:
        for entry in payload:
            if not entry.survey_id:
                raise HTTPException(status_code=400, detail="survey_id required for each grade")
            grade = services.upsert_survey_grade(
                db=db,
                survey_id=entry.survey_id,
                student_id=entry.student_id,
                question_id=entry.question_id,
                score=entry.score,
                note=entry.note,
            )
            results.append(grade)

        db.commit()
        return ok(results)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/survey-grades/{survey_id}",
    response_model=SuccessResponse[list[schemas.SurveyFormGradeOut]],
)
def get_survey_grades(
    survey_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    grades = services.get_survey_grades(db, survey_id, student_id)
    return ok(grades)


@router.get(
    "/survey/{survey_id}/response",
)
def get_student_survey_response(
    survey_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    from app.modules.survey.models import StudentResponse as SurveyStudentResponse
    result = db.query(SurveyStudentResponse).filter(
        SurveyStudentResponse.survey_id == survey_id,
        SurveyStudentResponse.student_id == str(student_id),
    ).order_by(SurveyStudentResponse.id.desc()).first()
    if result is None:
        return ok({})
    data = {
        "id": result.id,
        "survey_id": result.survey_id,
        "student_id": result.student_id,
        "answers": result.answers,
        "question_times": result.question_times,
        "started_at": result.started_at.isoformat() if result.started_at else None,
        "completed_at": result.completed_at.isoformat() if result.completed_at else None,
        "is_started": result.is_started,
        "is_finished": result.is_finished,
        "current_index": result.current_index,
        "overall_grade": result.overall_grade,
    }
    return ok(data)

@router.put("/form-grades", response_model=SuccessResponse[schemas.SurveyFormGradeOut])
def save_form_grade(
    payload: schemas.SurveyFormGradingEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload.form_id:
        raise HTTPException(status_code=400, detail="form_id is required")
    ensure_form_not_stopped(db, payload.form_id)

    try:
        grade = services.upsert_form_grade(
            db=db,
            form_id=payload.form_id,
            student_id=payload.student_id,
            question_id=payload.question_id,
            score=payload.score,
            note=payload.note,
        )
        db.commit()
        return ok(grade)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/form-grades/batch",
    response_model=SuccessResponse[list[schemas.SurveyFormGradeOut]],
)
def batch_save_form_grades(
    payload: list[schemas.SurveyFormGradingEntry],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload:
        raise HTTPException(status_code=400, detail="Grades list is required")
    for entry in payload:
        ensure_form_not_stopped(db, entry.form_id)

    results = []
    try:
        for entry in payload:
            if not entry.form_id:
                raise HTTPException(status_code=400, detail="form_id required for each grade")
            grade = services.upsert_form_grade(
                db=db,
                form_id=entry.form_id,
                student_id=entry.student_id,
                question_id=entry.question_id,
                score=entry.score,
                note=entry.note,
            )
            results.append(grade)

        db.commit()
        return ok(results)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/form-grades/{form_id}",
    response_model=SuccessResponse[list[schemas.SurveyFormGradeOut]],
)
def get_form_grades(
    form_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    grades = services.get_form_grades(db, form_id, student_id)
    return ok(grades)


@router.get(
    "/form/{form_id}/response",
)
def get_student_form_response(
    form_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    from app.modules.form.models import FormStudentResponse
    result = db.query(FormStudentResponse).filter(
        FormStudentResponse.form_id == form_id,
    ).filter(
        FormStudentResponse.student_id == str(student_id)
    ).order_by(FormStudentResponse.id.desc()).first()
    if result is None:
        return ok({})
    data = {
        "id": result.id,
        "form_id": result.form_id,
        "student_id": result.student_id,
        "answers": result.answers,
        "question_times": result.question_times,
        "started_at": result.started_at.isoformat() if result.started_at else None,
        "completed_at": result.completed_at.isoformat() if result.completed_at else None,
        "is_started": result.is_started,
        "is_finished": result.is_finished,
        "current_index": result.current_index,
        "overall_grade": result.overall_grade,
    }
    return ok(data)


# ===========================================================================
# Course Assignments (from course-selection)
# ===========================================================================

@router.get(
    "/course/{course_id}/quizzes",
    response_model=SuccessResponse[schemas.GradingQuizResponse],
)
def get_course_quizzes(
    course_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    result = services.get_course_quizzes(db, course_id, student_id)
    return ok(result)


@router.get(
    "/course/{course_id}/surveys",
    response_model=SuccessResponse[schemas.GradingSurveyResponse],
)
def get_course_surveys(
    course_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    result = services.get_course_surveys(db, course_id, student_id)
    return ok(result)


@router.get(
    "/course/{course_id}/forms",
    response_model=SuccessResponse[schemas.GradingFormResponse],
)
def get_course_forms(
    course_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    result = services.get_course_forms(db, course_id, student_id)
    return ok(result)


# ===========================================================================
# Progress
# ===========================================================================

@router.get(
    "/progress/course/{course_id}",
    response_model=SuccessResponse[list[schemas.ProgressEntry]],
)
def get_course_progress(
    course_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    progress = services.get_course_progress(db, course_id, student_id)
    return ok(progress)


# ===========================================================================
# Flight Pack Grading
# ===========================================================================

@router.get(
    "/course/{course_id}/flight-packages",
    response_model=SuccessResponse[schemas.GradingFlightPackagesOut],
)
def get_course_flight_packages(
    course_id: int,
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    result = services.get_course_flight_packages(db, course_id, student_id)
    return ok(result)


@router.put(
    "/flight-pack-fill",
    response_model=SuccessResponse[schemas.FlightPackFillOut],
)
def upsert_flight_pack_fill(
    payload: schemas.FlightPackFillPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    ensure_course_not_stopped(db, payload.course_instance_id)
    try:
        fill = services.upsert_flight_pack_fill(
            db=db,
            course_id=payload.course_instance_id,
            student_id=payload.student_id,
            pack_id=payload.pack_id,
            student_name=payload.student_name,
            rank=payload.rank,
            date=payload.date,
            sortie_number=payload.sortie_number,
            sortie_detail=payload.sortie_detail,
            hour_day=payload.hour_day,
            hour_night=payload.hour_night,
            hour_nvg=payload.hour_nvg,
            hour_total=payload.hour_total,
            inst_simulated=payload.inst_simulated,
            inst_actual=payload.inst_actual,
            inst_approaches=payload.inst_approaches,
            inst_ils=payload.inst_ils,
            inst_vor=payload.inst_vor,
            grade_sortie=payload.grade_sortie,
            grade_illum=payload.grade_illum,
            grade_weather=payload.grade_weather,
        )
        db.commit()
        return ok(fill)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/flight-pack-grades",
    response_model=SuccessResponse[schemas.FlightPackGradeOut],
)
def upsert_flight_pack_grade(
    payload: schemas.FlightPackGradeEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload.pack_id:
        raise HTTPException(status_code=400, detail="pack_id is required")
    ensure_course_not_stopped(db, payload.course_instance_id)

    try:
        grade = services.upsert_flight_pack_grade(
            db=db,
            course_id=payload.course_instance_id,
            student_id=payload.student_id,
            pack_id=payload.pack_id,
            task_id=payload.task_id,
            satisfied=payload.satisfied,
            score=payload.score,
            note=payload.note,
        )
        db.commit()
        return ok(grade)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/flight-pack-grades/batch",
    response_model=SuccessResponse[list[schemas.FlightPackGradeOut]],
)
def batch_save_flight_pack_grades(
    payload: list[schemas.FlightPackGradeEntry],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    if not payload:
        raise HTTPException(status_code=400, detail="Grades list is required")
    for entry in payload:
        ensure_course_not_stopped(db, entry.course_instance_id)

    results = []
    try:
        for entry in payload:
            grade = services.upsert_flight_pack_grade(
                db=db,
                course_id=entry.course_instance_id,
                student_id=entry.student_id,
                pack_id=entry.pack_id,
                task_id=entry.task_id,
                satisfied=entry.satisfied,
                score=entry.score,
                note=entry.note,
            )
            results.append(grade)

        db.commit()
        return ok(results)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
