#!/usr/bin/env python3
r"""Seed quizzes, surveys, and forms with sample data for local development.

Creates:
- 1 Quiz (T/F + essay + MC questions) from the question bank, linked via quiz_questions
- 1 Survey with T/F, rating and essay (text) questions + answer options
- 1 Form with T/F, multiple and essay (text) questions + answer options

All seeded data uses unique titles/names so it is safe to re-run (skips existing).

Run from anywhere with the backend's virtualenv interpreter, e.g.:

    backend\.venv\Scripts\python.exe backend\scripts\seed_quiz_survey_form.py   # Windows
    backend/.venv/bin/python backend/scripts/seed_quiz_survey_form.py            # Unix
"""

import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)


_VENV_DIR = _BACKEND_DIR / ".venv"


def _ensure_backend_venv() -> None:
    if not _VENV_DIR.exists():
        return

    if Path(sys.prefix).resolve() == _VENV_DIR.resolve():
        return

    activate = (
        _VENV_DIR / "Scripts" / "Activate.ps1"
        if os.name == "nt"
        else f"source {_VENV_DIR / 'bin' / 'activate'}"
    )
    venv_python = _VENV_DIR / ("Scripts" if os.name == "nt" else "bin") / "python"
    sys.exit(
        "Virtual environment is not active.\n"
        f"Activate the backend virtualenv first, then re-run:\n"
        f"    {activate}\n"
        "Or run it directly with the venv interpreter:\n"
        f"    {venv_python} {Path(__file__).name}"
    )


_ensure_backend_venv()

# Initialize modules in the same order as the application. Importing model
# packages directly can otherwise trigger their routers in a circular order.
import app.main  # noqa: F401

from app.core.database import SessionLocal
from app.modules import import_all_models
from app.modules.users.models import User
from app.modules.quiz_bank.models import Question as QuizQuestionModel, Quiz, QuizQuestion, QuizAttempt
from app.modules.survey.models import (
    StudentResponse as SurveyStudentResponse,
    Survey,
    SurveyQuestion,
    SurveyAnswerOption,
    SurveyQuestionPool,
)
from app.modules.form.models import (
    FormStudentResponse,
    Form,
    FormQuestion,
    FormAnswerOption,
    FormQuestionPool,
)
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────
# Quiz data (uses the question-bank approach: Questions + QuizQuestions)
# ─────────────────────────────────────────────────────────
QUIZ_NAME = "Dev Sample Quiz"
QUIZ_TYPE = "mixed"
QUIZ_STATUS = "published"
QUIZ_WEIGHT = 100

QUIZ_QUESTIONS = [
    (
        "What is the value of 2 + 2?",
        "multiple_choice",
        "easy",
        ["3", "4", "5", "6"],
        ["B"],
    ),
    (
        "True or False: Water boils at 100 degrees Celsius at sea level.",
        "true_false",
        "easy",
        ["True", "False"],
        ["A"],
    ),
    (
        "True or False: The Earth is flat.",
        "true_false",
        "easy",
        ["True", "False"],
        ["B"],
    ),
    (
        "What is the primary purpose of a lesson plan?",
        "true_false",
        "medium",
        ["True", "False"],
        ["A"],
    ),
    (
        "Describe the importance of formative assessment in education.",
        "essay",
        "medium",
        None,
        [],
    ),
    (
        "Explain how a rubric supports fair grading practices.",
        "essay",
        "difficult",
        None,
        [],
    ),
]


# ─────────────────────────────────────────────────────────
# Survey data
# ─────────────────────────────────────────────────────────
SURVEY_TITLE = "Dev Sample Survey"
SURVEY_DESCRIPTION = "A sample survey for development and testing."
SURVEY_STATUS = "published"
SURVEY_ASSIGNMENT_TYPE = "general"

SURVEY_QUESTIONS = [
    {
        "text": "True or False: Regular feedback improves student performance.",
        "type": "true_false",
        "weight": 10,
        "required": True,
        "allow_multiple": False,
        "options": ["True", "False"],
    },
    {
        "text": "True or False: The LMS system is easy to navigate.",
        "type": "true_false",
        "weight": 10,
        "required": True,
        "allow_multiple": False,
        "options": ["True", "False"],
    },
    {
        "text": "How satisfied are you with the course material?",
        "type": "rating",
        "weight": 20,
        "required": True,
        "allow_multiple": False,
        "options": ["1", "2", "3", "4", "5"],
    },
    {
        "text": "What aspects of the course could be improved?",
        "type": "text",
        "weight": 30,
        "required": True,
        "allow_multiple": False,
        "options": [],
    },
    {
        "text": "Describe a concept from this course that you found most challenging and why.",
        "type": "text",
        "weight": 30,
        "required": True,
        "allow_multiple": False,
        "options": [],
    },
]


# ─────────────────────────────────────────────────────────
# Form data
# ─────────────────────────────────────────────────────────
FORM_TITLE = "Dev Sample Form"
FORM_DESCRIPTION = "A sample form for development and testing."
FORM_STATUS = "published"
FORM_ASSIGNMENT_TYPE = "general"

FORM_QUESTIONS = [
    {
        "text": "True or False: All assignments must be submitted by the deadline.",
        "type": "true_false",
        "weight": 10,
        "required": True,
        "allow_multiple": False,
        "options": ["True", "False"],
    },
    {
        "text": "True or False: Peer review is part of the grading process.",
        "type": "true_false",
        "weight": 10,
        "required": True,
        "allow_multiple": False,
        "options": ["True", "False"],
    },
    {
        "text": "What grade level are you currently enrolled in?",
        "type": "multiple",
        "weight": 20,
        "required": True,
        "allow_multiple": False,
        "options": ["Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    },
    {
        "text": "Describe your learning goals for this semester.",
        "type": "text",
        "weight": 30,
        "required": True,
        "allow_multiple": False,
        "options": [],
    },
    {
        "text": "Describe any accommodations or support you need.",
        "type": "text",
        "weight": 30,
        "required": False,
        "allow_multiple": False,
        "options": [],
    },
]


# ─────────────────────────────────────────────────────────
# Seeding functions
# ─────────────────────────────────────────────────────────


def _sample_student_ids(db: Session) -> tuple[int, int]:
    users = {
        user.username: user.id
        for user in db.query(User).filter(User.username.in_(("student", "student1"))).all()
    }
    missing = {"student", "student1"} - users.keys()
    if missing:
        raise ValueError(
            "Missing sample users: "
            f"{', '.join(sorted(missing))}. Run seed_default_users.py first."
        )
    return users["student"], users["student1"]


def seed_quiz(db: Session) -> None:
    existing = db.query(Quiz).filter(Quiz.name == QUIZ_NAME).first()
    if existing:
        logger.info("Quiz already exists, skipping: %s", QUIZ_NAME)
        return

    logger.info("Creating quiz: %s", QUIZ_NAME)
    quiz = Quiz(
        name=QUIZ_NAME,
        type=QUIZ_TYPE,
        description="",
        weight=QUIZ_WEIGHT,
        status=QUIZ_STATUS,
    )
    db.add(quiz)
    db.flush()

    for i, (desc, qtype, difficulty, choices, answers) in enumerate(QUIZ_QUESTIONS):
        question = QuizQuestionModel(
            description=desc,
            type=qtype,
            difficulty=difficulty,
            choices=choices,
            answers=answers,
        )
        db.add(question)
        db.flush()

        quiz_question = QuizQuestion(
            quiz=quiz,
            question=question,
            weight=10 if qtype == "essay" else 1,
            order_index=i + 1,
        )
        db.add(quiz_question)

    student_id, _ = _sample_student_ids(db)
    essay_question_ids = [
        qq.question_id
        for qq in db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == quiz.id,
            QuizQuestion.question.has(type="essay"),
        ).all()
    ]
    has_essay = len(essay_question_ids) > 0
    total_weight = (
        db.query(QuizQuestion.weight)
        .filter(QuizQuestion.quiz_id == quiz.id)
        .all()
    )
    max_score = sum(w[0] for w in total_weight) if total_weight else 0
    quiz_id = quiz.id
    now = datetime.now(timezone.utc)

    quiz_attempt_answers = []
    expected_score = 0
    for qq in db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == quiz_id
    ).order_by(QuizQuestion.order_index).all():
        q = qq.question
        q_type = q.type
        q_choices = q.choices or []
        q_answers = q.answers or []
        if q_type == "true_false":
            user_answers = ["A", "B"]
            student_ans = [q_answers[0]] if q_answers[0] == user_answers[0] else [user_answers[1]]
            if student_ans == q_answers:
                expected_score += qq.weight
        elif q_type == "multiple_choice":
            user_answers = q_choices
            student_ans = [q_answers[0]] if q_answers[0] in user_answers else [q_choices[1]]
            if set(student_ans) == set(q_answers):
                expected_score += qq.weight
        else:
            student_ans = ["This is a sample essay answer about assessment practices."]

        quiz_attempt_answers.append({
            "question_id": q.id,
            "question_type": q_type,
            "user_selections": student_ans,
        })

    quiz_attempt = QuizAttempt(
        quiz_id=quiz_id,
        student_id=student_id,
        score=expected_score,
        max_score=max_score,
        has_essay=has_essay,
        answers=quiz_attempt_answers,
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(quiz_attempt)

    logger.info(
        "Quiz '%s' created with %d questions, attempt by user %d (score=%d/%d)",
        QUIZ_NAME,
        len(QUIZ_QUESTIONS),
        student_id,
        expected_score,
        max_score,
    )


def seed_survey(db: Session) -> None:
    existing = db.query(Survey).filter(Survey.title == SURVEY_TITLE).first()
    if existing:
        logger.info("Survey already exists, skipping: %s", SURVEY_TITLE)
        return

    logger.info("Creating survey: %s", SURVEY_TITLE)
    now = datetime.now(timezone.utc)
    survey = Survey(
        title=SURVEY_TITLE,
        description=SURVEY_DESCRIPTION,
        status=SURVEY_STATUS,
        scheduled_at=now + timedelta(days=1),
        assignment_type=SURVEY_ASSIGNMENT_TYPE,
        created_at=now,
        updated_at=now,
    )
    db.add(survey)
    db.flush()

    for q in SURVEY_QUESTIONS:
        sq = SurveyQuestion(
            survey=survey,
            pool_question_id=None,
            text=q["text"],
            type=q["type"],
            weight=q["weight"],
            required=q["required"],
            allow_multiple=q["allow_multiple"],
            created_at=now,
            updated_at=now,
        )
        db.add(sq)
        db.flush()

        for opt_text in q["options"]:
            opt = SurveyAnswerOption(
                question=sq,
                text=opt_text,
                weight=1,
                created_at=now,
                updated_at=now,
            )
            db.add(opt)

    student1_answers = {}
    student2_answers = {}
    questions = (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == survey.id)
        .order_by(SurveyQuestion.id)
        .all()
    )
    for i, sq in enumerate(questions):
        t = sq.type
        if t == "true_false":
            student1_answers[str(sq.id)] = "True"
            student2_answers[str(sq.id)] = "False"
        elif t == "rating":
            student1_answers[str(sq.id)] = 5
            student2_answers[str(sq.id)] = 3
        elif t == "text":
            student1_answers[str(sq.id)] = "The pacing was excellent but more practice materials would help."
            student2_answers[str(sq.id)] = "I would appreciate more interactive exercises and case studies."
        else:
            student1_answers[str(sq.id)] = "Detailed feedback"
            student2_answers[str(sq.id)] = "Needs improvement"

    student1_id, student2_id = _sample_student_ids(db)
    for student_id, answers in [
        (student1_id, student1_answers),
        (student2_id, student2_answers),
    ]:
        resp = SurveyStudentResponse(
            survey=survey,
            student_id=str(student_id),
            answers=answers,
            started_at=now,
            completed_at=now + timedelta(minutes=15),
            is_started=True,
            is_finished=True,
            current_index=len(questions),
            overall_grade=42,
            created_at=now,
            updated_at=now,
        )
        db.add(resp)

    logger.info(
        "Survey '%s' created with %d questions and 2 student responses",
        SURVEY_TITLE,
        len(SURVEY_QUESTIONS),
    )


def seed_form(db: Session) -> None:
    existing = db.query(Form).filter(Form.title == FORM_TITLE).first()
    if existing:
        logger.info("Form already exists, skipping: %s", FORM_TITLE)
        return

    logger.info("Creating form: %s", FORM_TITLE)
    now = datetime.now(timezone.utc)
    form = Form(
        title=FORM_TITLE,
        description=FORM_DESCRIPTION,
        status=FORM_STATUS,
        scheduled_at=now + timedelta(days=1),
        assignment_type=FORM_ASSIGNMENT_TYPE,
        created_at=now,
        updated_at=now,
    )
    db.add(form)
    db.flush()

    for q in FORM_QUESTIONS:
        fq = FormQuestion(
            form=form,
            pool_question_id=None,
            text=q["text"],
            type=q["type"],
            weight=q["weight"],
            required=q["required"],
            allow_multiple=q["allow_multiple"],
            created_at=now,
            updated_at=now,
        )
        db.add(fq)
        db.flush()

        for opt_text in q["options"]:
            ao = FormAnswerOption(
                question=fq,
                text=opt_text,
                weight=1,
                created_at=now,
                updated_at=now,
            )
            db.add(ao)

    student1_answers = {}
    student2_answers = {}
    questions = (
        db.query(FormQuestion)
        .filter(FormQuestion.form_id == form.id)
        .order_by(FormQuestion.id)
        .all()
    )
    for fq in questions:
        t = fq.type
        if t == "true_false":
            student1_answers[str(fq.id)] = "True"
            student2_answers[str(fq.id)] = "False"
        elif t == "multiple":
            student1_answers[str(fq.id)] = "Grade 10"
            student2_answers[str(fq.id)] = "Grade 11"
        elif t == "text":
            student1_answers[str(fq.id)] = "I want to improve my math and science skills this semester."
            student2_answers[str(fq.id)] = "My goals are to develop better study habits and time management."
        else:
            student1_answers[str(fq.id)] = "No additional support needed"
            student2_answers[str(fq.id)] = "Additional tutoring in mathematics"

    student1_id, student2_id = _sample_student_ids(db)
    for student_id, answers in [
        (student1_id, student1_answers),
        (student2_id, student2_answers),
    ]:
        resp = FormStudentResponse(
            form=form,
            student_id=str(student_id),
            answers=answers,
            started_at=now,
            completed_at=now + timedelta(minutes=10),
            is_started=True,
            is_finished=True,
            current_index=len(questions),
            overall_grade=38,
            created_at=now,
            updated_at=now,
        )
        db.add(resp)

    logger.info(
        "Form '%s' created with %d questions and 2 student responses",
        FORM_TITLE,
        len(FORM_QUESTIONS),
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    import_all_models()
    db = SessionLocal()
    try:
        seed_quiz(db)
        seed_survey(db)
        seed_form(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
