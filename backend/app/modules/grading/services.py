import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .models import (
    QuizGrade, SurveyGrade, FormGrade, GradingProgress,
)

logger = logging.getLogger(__name__)


def get_course_id_from_quiz(db: Session, quiz_id: int) -> Optional[int]:
    """Find the course_instance_id for a quiz via CourseSelectionEvaluationLessonQuiz."""
    from app.modules.course_selection_evaluation.models import CourseSelectionEvaluationLessonQuiz
    assoc = db.query(CourseSelectionEvaluationLessonQuiz).filter(
        CourseSelectionEvaluationLessonQuiz.quiz_id == quiz_id
    ).first()
    return assoc.course_instance_id if assoc else None


def get_course_id_from_survey(db: Session, survey_id: int) -> Optional[int]:
    """Find the course_instance_id for a survey via Survey.course_id."""
    from app.modules.survey.models import Survey
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    return survey.course_id if survey and survey.course_id else None


def get_course_id_from_form(db: Session, form_id: int) -> Optional[int]:
    """Find the course_instance_id for a form via Form.course_id."""
    from app.modules.form.models import Form
    form = db.query(Form).filter(Form.id == form_id).first()
    return form.course_id if form and form.course_id else None


def _ensure_progress(db: Session, student_id: int, course_id: int, grading_type: str):
    """Ensure a GradingProgress row exists, returning it."""
    progress = db.query(GradingProgress).filter(
        GradingProgress.course_id == course_id,
        GradingProgress.student_id == student_id,
        GradingProgress.grading_type == grading_type,
    ).first()

    if not progress:
        progress = GradingProgress(
            course_id=course_id,
            student_id=student_id,
            grading_type=grading_type,
            graded_count=0,
            total_count=0,
        )
        db.add(progress)
        db.flush()

    return progress


def _update_progress_count(progress: GradingProgress, existing: bool, total_count: int):
    """Increment graded_count on first insert only, compute progress_percent."""
    if not existing:
        if progress.total_count == 0:
            progress.total_count = total_count
        progress.graded_count += 1

    if progress.total_count > 0:
        progress.progress_percent = min(100, round(progress.graded_count / progress.total_count * 100))


def upsert_quiz_grade(
    db: Session,
    quiz_id: int,
    student_id: int,
    question_id: int,
    score: int,
    note: Optional[str] = None,
):
    """Upsert a quiz grade and update progress."""
    existing = db.query(QuizGrade).filter(
        QuizGrade.quiz_id == quiz_id,
        QuizGrade.student_id == student_id,
        QuizGrade.question_id == question_id,
    ).first()

    if existing:
        existing.score = score
        existing.note = note
        db.flush()
        return existing

    grade = QuizGrade(
        quiz_id=quiz_id,
        student_id=student_id,
        question_id=question_id,
        score=score,
        note=note,
    )
    db.add(grade)

    course_id = get_course_id_from_quiz(db, quiz_id)
    if not course_id:
        db.flush()
        return grade

    from app.modules.quiz_bank.models import QuizQuestion
    total_count = db.query(func.count(QuizQuestion.id)).filter(
        QuizQuestion.quiz_id == quiz_id
    ).scalar() or 0

    progress = _ensure_progress(db, student_id, course_id, "quiz")
    _update_progress_count(progress, False, total_count)

    db.flush()
    return grade


def upsert_survey_grade(
    db: Session,
    survey_id: int,
    student_id: int,
    question_id: int,
    score: int,
    note: Optional[str] = None,
):
    """Upsert a survey grade and update progress."""
    existing = db.query(SurveyGrade).filter(
        SurveyGrade.survey_id == survey_id,
        SurveyGrade.student_id == student_id,
        SurveyGrade.question_id == question_id,
    ).first()

    if existing:
        existing.score = score
        existing.note = note
        db.flush()
        return existing

    grade = SurveyGrade(
        survey_id=survey_id,
        student_id=student_id,
        question_id=question_id,
        score=score,
        note=note,
    )
    db.add(grade)

    course_id = get_course_id_from_survey(db, survey_id)
    if not course_id:
        db.flush()
        return grade

    from app.modules.survey.models import SurveyQuestion
    total_count = db.query(func.count(SurveyQuestion.id)).filter(
        SurveyQuestion.survey_id == survey_id
    ).scalar() or 0

    progress = _ensure_progress(db, student_id, course_id, "survey")
    _update_progress_count(progress, False, total_count)

    db.flush()
    return grade


def upsert_form_grade(
    db: Session,
    form_id: int,
    student_id: int,
    question_id: int,
    score: int,
    note: Optional[str] = None,
):
    """Upsert a form grade and update progress."""
    existing = db.query(FormGrade).filter(
        FormGrade.form_id == form_id,
        FormGrade.student_id == student_id,
        FormGrade.question_id == question_id,
    ).first()

    if existing:
        existing.score = score
        existing.note = note
        db.flush()
        return existing

    grade = FormGrade(
        form_id=form_id,
        student_id=student_id,
        question_id=question_id,
        score=score,
        note=note,
    )
    db.add(grade)

    course_id = get_course_id_from_form(db, form_id)
    if not course_id:
        db.flush()
        return grade

    from app.modules.form.models import FormQuestion
    total_count = db.query(func.count(FormQuestion.id)).filter(
        FormQuestion.form_id == form_id
    ).scalar() or 0

    progress = _ensure_progress(db, student_id, course_id, "form")
    _update_progress_count(progress, False, total_count)

    db.flush()
    return grade


def get_quiz_grades(db: Session, quiz_id: int, student_id: Optional[int] = None):
    """Get quiz grades for a quiz, optionally filtered by student."""
    query = db.query(QuizGrade).filter(
        QuizGrade.quiz_id == quiz_id
    )
    if student_id:
        query = query.filter(QuizGrade.student_id == student_id)
    return query.all()


def get_survey_grades(db: Session, survey_id: int, student_id: Optional[int] = None):
    """Get survey grades for a survey, optionally filtered by student."""
    query = db.query(SurveyGrade).filter(
        SurveyGrade.survey_id == survey_id
    )
    if student_id:
        query = query.filter(SurveyGrade.student_id == student_id)
    return query.all()


def get_form_grades(db: Session, form_id: int, student_id: Optional[int] = None):
    """Get form grades for a form, optionally filtered by student."""
    query = db.query(FormGrade).filter(
        FormGrade.form_id == form_id
    )
    if student_id:
        query = query.filter(FormGrade.student_id == student_id)
    return query.all()


def get_course_progress(db: Session, course_id: int, student_id: Optional[int] = None):
    """Get all progress entries for a course, optionally for a specific student."""
    query = db.query(GradingProgress).filter(
        GradingProgress.course_id == course_id
    )
    if student_id:
        query = query.filter(GradingProgress.student_id == student_id)
    progress_list = query.all()

    result = []
    for p in progress_list:
        progress_percent = 0
        if p.total_count > 0:
            progress_percent = min(100, round(p.graded_count / p.total_count * 100))
        result.append({
            "student_id": p.student_id,
            "grading_type": p.grading_type,
            "graded_count": p.graded_count,
            "total_count": p.total_count,
            "progress_percent": progress_percent,
        })
    return result


# ===========================================================================
# Course Assignment Retrieval (from course-selection)
# ===========================================================================

def get_course_quizzes(db: Session, course_id: int, student_id: Optional[int] = None) -> dict:
    """Get all quiz IDs + questions assigned to a course with saved grades."""
    from app.modules.course_selection_evaluation.models import CourseSelectionEvaluationLessonQuiz
    from app.modules.quiz_bank.models import QuizQuestion as QBQ, Question
    from .models import QuizGrade

    quizzes = db.query(CourseSelectionEvaluationLessonQuiz.quiz_id).filter(
        CourseSelectionEvaluationLessonQuiz.course_instance_id == course_id
    ).distinct().all()

    if not quizzes:
        return {"quiz_ids": [], "questions": []}

    quiz_ids = [q[0] for q in quizzes]
    zz = db.query(QBQ).filter(QBQ.quiz_id.in_(quiz_ids)).all()

    if not zz:
        return {"quiz_ids": quiz_ids, "questions": []}

    qids = list(set(qq.question_id for qq in zz))
    questions = db.query(Question).filter(Question.id.in_(qids)).all()
    qmap = {q.id: q for q in questions}

    grades_map: dict[tuple, dict] = {}
    if student_id:
        all_grades = db.query(QuizGrade).filter(
            QuizGrade.quiz_id.in_(quiz_ids),
            QuizGrade.student_id == student_id
        ).all()
        grades_map = {
            (g.quiz_id, g.question_id): {"score": g.score, "note": g.note}
            for g in all_grades
        }

    questions_list = []
    for qq in zz:
        q = qmap.get(qq.question_id)
        if q:
            grade_info = grades_map.get((qq.quiz_id, qq.question_id), {})
            questions_list.append({
                "question_id": qq.question_id,
                "quiz_id": qq.quiz_id,
                "question_text": q.description,
                "question_type": q.type,
                "weight": qq.weight,
                "choices": q.choices,
                "grade": grade_info.get("score"),
                "note": grade_info.get("note"),
            })

    return {"quiz_ids": quiz_ids, "questions": questions_list}


def get_course_surveys(db: Session, course_id: int, student_id: Optional[int] = None) -> dict:
    """Get all survey IDs + questions assigned to a course with saved grades."""
    from app.modules.course_selection_form.models import CourseSelectionFormSurveyLink
    from app.modules.survey.models import SurveyQuestion
    from .models import SurveyGrade

    links = db.query(CourseSelectionFormSurveyLink).filter(
        CourseSelectionFormSurveyLink.course_instance_id == course_id
    ).all()

    if not links:
        return {"survey_ids": [], "questions": []}

    survey_ids = list(set(sl.survey_id for sl in links))
    questions = db.query(SurveyQuestion).filter(
        SurveyQuestion.survey_id.in_(survey_ids)
    ).order_by(SurveyQuestion.survey_id, SurveyQuestion.id).all()

    grades_map: dict[tuple, dict] = {}
    if student_id:
        all_grades = db.query(SurveyGrade).filter(
            SurveyGrade.survey_id.in_(survey_ids),
            SurveyGrade.student_id == student_id
        ).all()
        grades_map = {
            (g.survey_id, g.question_id): {"score": g.score, "note": g.note}
            for g in all_grades
        }

    questions_list = []
    for q in questions:
        grade_info = grades_map.get((q.survey_id, q.id), {})
        questions_list.append({
            "question_id": q.id,
            "survey_id": q.survey_id,
            "question_text": q.text,
            "question_type": q.type,
            "weight": q.weight,
            "allow_multiple": q.allow_multiple,
            "options": [{"id": opt.id, "text": opt.text, "weight": opt.weight} for opt in q.options],
            "grade": grade_info.get("score"),
            "note": grade_info.get("note"),
        })

    return {"survey_ids": survey_ids, "questions": questions_list}


def get_course_forms(db: Session, course_id: int, student_id: Optional[int] = None) -> dict:
    """Get all form IDs + questions assigned to a course with saved grades."""
    from app.modules.course_selection_form.models import CourseSelectionFormFormLink
    from app.modules.form.models import FormQuestion
    from .models import FormGrade

    links = db.query(CourseSelectionFormFormLink).filter(
        CourseSelectionFormFormLink.course_instance_id == course_id
    ).all()

    if not links:
        return {"form_ids": [], "questions": []}

    form_ids = list(set(fl.form_id for fl in links))
    questions = db.query(FormQuestion).filter(
        FormQuestion.form_id.in_(form_ids)
    ).order_by(FormQuestion.form_id, FormQuestion.id).all()

    grades_map: dict[tuple, dict] = {}
    if student_id:
        all_grades = db.query(FormGrade).filter(
            FormGrade.form_id.in_(form_ids),
            FormGrade.student_id == student_id
        ).all()
        grades_map = {
            (g.form_id, g.question_id): {"score": g.score, "note": g.note}
            for g in all_grades
        }

    questions_list = []
    for q in questions:
        grade_info = grades_map.get((q.form_id, q.id), {})
        questions_list.append({
            "question_id": q.id,
            "form_id": q.form_id,
            "question_text": q.text,
            "question_type": q.type,
            "weight": q.weight,
            "allow_multiple": q.allow_multiple,
            "options": [{"id": opt.id, "text": opt.text, "weight": opt.weight} for opt in q.options],
            "grade": grade_info.get("score"),
            "note": grade_info.get("note"),
        })

    return {"form_ids": form_ids, "questions": questions_list}


# ===========================================================================
# Flight Pack Grading
# ===========================================================================

def _get_total_flight_tasks(db: Session, course_id: int) -> int:
    """Count total tasks across all flight packages for a course instance."""
    from app.modules.course_selection_currencies_certificate.models import (
        CourseSelectionInfoFlightPackage,
        CourseSelectionInfoFlightPackageTask,
    )
    total = db.query(func.count(CourseSelectionInfoFlightPackageTask.id)).join(
        CourseSelectionInfoFlightPackage,
        CourseSelectionInfoFlightPackageTask.package_id == CourseSelectionInfoFlightPackage.id,
    ).filter(
        CourseSelectionInfoFlightPackage.course_instance_id == course_id
    ).scalar() or 0
    return total


def get_course_flight_packages(db: Session, course_id: int, student_id: Optional[int] = None) -> dict:
    """Get all flight packages for a course with tasks + saved fill data + grades."""
    from app.modules.course_selection_currencies_certificate.models import (
        CourseSelectionInfoFlightPackage,
        CourseSelectionInfoFlightPackageTask,
    )

    packages = (
        db.query(CourseSelectionInfoFlightPackage)
        .filter(CourseSelectionInfoFlightPackage.course_instance_id == course_id)
        .order_by(CourseSelectionInfoFlightPackage.position, CourseSelectionInfoFlightPackage.id)
        .all()
    )

    if not packages:
        return {"packages": [], "fills": [], "served_at": ""}

    # Gather all tasks for all packages
    pkg_ids = [p.id for p in packages]
    tasks = (
        db.query(CourseSelectionInfoFlightPackageTask)
        .filter(CourseSelectionInfoFlightPackageTask.package_id.in_(pkg_ids))
        .order_by(CourseSelectionInfoFlightPackageTask.package_id, CourseSelectionInfoFlightPackageTask.position)
        .all()
    )

    # Build package -> tasks map
    pkg_map: dict[int, dict] = {}
    for p in packages:
        pkg_map[p.id] = {
            "pack_id": p.id,
            "name": p.name,
            "tasks": [],
        }

    for t in tasks:
        if t.package_id in pkg_map:
            pkg_map[t.package_id]["tasks"].append({
                "task_id": t.id,
                "task_no": t.task.task_no if t.task else "",
                "task_desc": t.task.task_description if t.task else "",
            })

    # Load saved fill records if student specified
    fills_list: list[dict] = []
    fill_map: dict[int, dict] = {}
    if student_id:
        from .models import FlightPackFillRecord
        fill_records = (
            db.query(FlightPackFillRecord)
            .filter(
                FlightPackFillRecord.course_instance_id == course_id,
                FlightPackFillRecord.student_id == student_id,
            )
            .all()
        )
        for fr in fill_records:
            fill_map[fr.pack_id] = {
                "pack_id": fr.pack_id,
                "student_name": fr.student_name,
                "rank": fr.rank,
                "date": fr.date,
                "sortie_number": fr.sortie_number,
                "sortie_detail": fr.sortie_detail,
                "hour_day": fr.hour_day,
                "hour_night": fr.hour_night,
                "hour_nvg": fr.hour_nvg,
                "hour_total": fr.hour_total,
                "inst_simulated": fr.inst_simulated,
                "inst_actual": fr.inst_actual,
                "inst_approaches": fr.inst_approaches,
                "inst_ils": fr.inst_ils,
                "inst_vor": fr.inst_vor,
                "grade_sortie": fr.grade_sortie,
                "grade_illum": fr.grade_illum,
                "grade_weather": fr.grade_weather,
            }
        fills_list = list(fill_map.values())

    # Load saved grades if student specified
    grades_map: dict[tuple, dict] = {}
    if student_id:
        from .models import FlightPackGrade
        grade_records = (
            db.query(FlightPackGrade)
            .filter(
                FlightPackGrade.course_instance_id == course_id,
                FlightPackGrade.student_id == student_id,
            )
            .all()
        )
        for g in grade_records:
            grades_map[(g.pack_id, g.task_id)] = {
                "satisfied": g.satisfied,
                "score": g.score,
                "note": g.note,
            }

    # Augment tasks with saved grades
    for pkg in pkg_map.values():
        for task in pkg["tasks"]:
            key = (pkg["pack_id"], task["task_id"])
            ginfo = grades_map.get(key, {})
            task["satisfied"] = ginfo.get("satisfied")
            task["score"] = ginfo.get("score")
            task["note"] = ginfo.get("note")

    return {
        "packages": list(pkg_map.values()),
        "fills": fills_list,
        "served_at": datetime.utcnow().isoformat(),
    }


def upsert_flight_pack_fill(db: Session, course_id: int, student_id: int, pack_id: int, **fields) -> dict:
    """Upsert a flight pack fill record for a student."""
    from .models import FlightPackFillRecord

    existing = db.query(FlightPackFillRecord).filter(
        FlightPackFillRecord.course_instance_id == course_id,
        FlightPackFillRecord.student_id == student_id,
        FlightPackFillRecord.pack_id == pack_id,
    ).first()

    if existing:
        for key, value in fields.items():
            setattr(existing, key, value)
        db.flush()
        return dict(
            id=existing.id,
            pack_id=existing.pack_id,
            student_name=existing.student_name,
            rank=existing.rank,
            date=existing.date,
            sortie_number=existing.sortie_number,
            sortie_detail=existing.sortie_detail,
            hour_day=existing.hour_day,
            hour_night=existing.hour_night,
            hour_nvg=existing.hour_nvg,
            hour_total=existing.hour_total,
            inst_simulated=existing.inst_simulated,
            inst_actual=existing.inst_actual,
            inst_approaches=existing.inst_approaches,
            inst_ils=existing.inst_ils,
            inst_vor=existing.inst_vor,
            grade_sortie=existing.grade_sortie,
            grade_illum=existing.grade_illum,
            grade_weather=existing.grade_weather,
        )

    record = FlightPackFillRecord(
        course_instance_id=course_id,
        student_id=student_id,
        pack_id=pack_id,
        **fields,
    )
    db.add(record)
    db.flush()
    return dict(
        id=record.id,
        pack_id=record.pack_id,
        student_name=record.student_name,
        rank=record.rank,
        date=record.date,
        sortie_number=record.sortie_number,
        sortie_detail=record.sortie_detail,
        hour_day=record.hour_day,
        hour_night=record.hour_night,
        hour_nvg=record.hour_nvg,
        hour_total=record.hour_total,
        inst_simulated=record.inst_simulated,
        inst_actual=record.inst_actual,
        inst_approaches=record.inst_approaches,
        inst_ils=record.inst_ils,
        inst_vor=record.inst_vor,
        grade_sortie=record.grade_sortie,
        grade_illum=record.grade_illum,
        grade_weather=record.grade_weather,
    )


def upsert_flight_pack_grade(
    db: Session,
    course_id: int,
    student_id: int,
    pack_id: int,
    task_id: int,
    satisfied: Optional[bool],
    score: Optional[int] = None,
    note: Optional[str] = None,
) -> dict:
    """Upsert a flight pack task grade and update progress."""
    from .models import FlightPackGrade

    existing = db.query(FlightPackGrade).filter(
        FlightPackGrade.course_instance_id == course_id,
        FlightPackGrade.student_id == student_id,
        FlightPackGrade.pack_id == pack_id,
        FlightPackGrade.task_id == task_id,
    ).first()

    if existing:
        existing.satisfied = satisfied
        existing.score = score
        existing.note = note
        db.flush()
        return existing

    grade = FlightPackGrade(
        course_instance_id=course_id,
        student_id=student_id,
        pack_id=pack_id,
        task_id=task_id,
        satisfied=satisfied,
        score=score,
        note=note,
    )
    db.add(grade)

    # Update progress
    total_count = _get_total_flight_tasks(db, course_id)
    progress = _ensure_progress(db, student_id, course_id, "flight-pack")
    _update_progress_count(progress, False, total_count)

    db.flush()
    return grade

