import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

from .models import Question, Quiz, QuizAttempt, QuizQuestion, QuizRecipient
from .schemas import (
    AttemptAnswerResult,
    QuizAttemptResponse,
    QuizAttemptSubmit,
    QuizCreate,
    QuizQuestionCreate,
    QuizQuestionResponse,
    QuizQuestionUpdate,
    QuizResponse,
    QuizStatusUpdate,
    QuizUpdate,
    QuizType,
    QuizTakerResponse,
    RecipientsResponse,
    RecipientsUpdate,
)

from app.modules.users.models import User, Role, Permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quiz-bank", tags=["Quiz Bank"])


# ---------------------------------------------------------------------------
# Quizzes
# ---------------------------------------------------------------------------
@router.get("/quizzes", response_model=SuccessResponse[list[QuizResponse]])
def list_quizzes(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_VIEW)),
):
    quizzes = (
        db.query(Quiz)
        .options(selectinload(Quiz.questions).joinedload(QuizQuestion.question))
        .order_by(Quiz.id)
        .all()
    )
    return ok(quizzes)


# ---------------------------------------------------------------------------
# Sending a quiz directly to students (no course / lesson link)
# ---------------------------------------------------------------------------
@router.get(
    "/eligible-takers", response_model=SuccessResponse[list[QuizTakerResponse]]
)
def list_eligible_takers(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_MANAGE)),
):
    """Users who can take a quiz — the roster shown in the "Send" picker."""
    users = (
        db.query(User)
        .join(User.roles)
        .join(Role.permissions)
        .filter(
            Permission.code == PermissionCode.QUIZ_TAKE.value,
            User.is_active == True,
        )
        .distinct()
        .all()
    )
    # ``User.full_name`` is a computed property (not a column), so sort in Python.
    users.sort(key=lambda u: (u.full_name or u.username or "").lower())
    return ok(users)


@router.get(
    "/quizzes/assigned", response_model=SuccessResponse[list[QuizResponse]]
)
def list_assigned_quizzes(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.QUIZ_TAKE)),
):
    """A student's quizzes: approved, sent to them, and not yet taken.

    "Sent to them" covers both a direct send (quiz_recipients) and a per-lesson
    release from Schedule Management (course_selection_lesson_releases, keyed by
    the student's profile id).
    """
    from app.modules.course_selection_schedule.lesson_content_models import (
        CourseSelectionLessonRelease,
    )

    taken_ids = {
        row[0]
        for row in db.query(QuizAttempt.quiz_id)
        .filter(QuizAttempt.student_id == current_user.id)
        .all()
    }
    assigned_ids = {
        row[0]
        for row in db.query(QuizRecipient.quiz_id)
        .filter(QuizRecipient.student_id == current_user.id)
        .all()
    }
    profile_id = current_user.profile.id if current_user.profile else None
    if profile_id is not None:
        assigned_ids |= {
            row[0]
            for row in db.query(CourseSelectionLessonRelease.content_id)
            .filter(
                CourseSelectionLessonRelease.content_type == "quiz",
                CourseSelectionLessonRelease.student_id == profile_id,
            )
            .all()
        }
    visible_ids = assigned_ids - taken_ids
    if not visible_ids:
        return ok([])
    quizzes = (
        db.query(Quiz)
        .options(selectinload(Quiz.questions).joinedload(QuizQuestion.question))
        .filter(Quiz.id.in_(visible_ids), Quiz.status == "approved")
        .order_by(Quiz.id)
        .all()
    )
    return ok(quizzes)


def _quiz_completed_student_ids(db: Session, quiz_id: int) -> list[int]:
    return [
        row[0]
        for row in db.query(QuizAttempt.student_id)
        .filter(QuizAttempt.quiz_id == quiz_id)
        .distinct()
        .all()
    ]


@router.get(
    "/quizzes/{quiz_id}/recipients",
    response_model=SuccessResponse[RecipientsResponse],
)
def get_quiz_recipients(
    quiz_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_MANAGE)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    student_ids = [
        row[0]
        for row in db.query(QuizRecipient.student_id)
        .filter(QuizRecipient.quiz_id == quiz_id)
        .all()
    ]
    return ok(
        RecipientsResponse(
            student_ids=student_ids,
            completed_student_ids=_quiz_completed_student_ids(db, quiz_id),
        )
    )


@router.put(
    "/quizzes/{quiz_id}/recipients",
    response_model=SuccessResponse[RecipientsResponse],
)
def set_quiz_recipients(
    quiz_id: int,
    data: RecipientsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.QUIZ_MANAGE)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="Approve this quiz before sending it to students.",
        )

    completed = set(_quiz_completed_student_ids(db, quiz_id))
    existing = {
        row[0]
        for row in db.query(QuizRecipient.student_id)
        .filter(QuizRecipient.quiz_id == quiz_id)
        .all()
    }
    # Students who've already taken it stay assigned no matter what the client sends.
    final = set(data.student_ids) | completed
    to_add = final - existing
    to_remove = existing - final

    if to_remove:
        db.query(QuizRecipient).filter(
            QuizRecipient.quiz_id == quiz_id,
            QuizRecipient.student_id.in_(to_remove),
        ).delete(synchronize_session=False)
    for sid in to_add:
        db.add(QuizRecipient(quiz_id=quiz_id, student_id=sid, sent_by=current_user.id))
    db.commit()

    return ok(
        RecipientsResponse(
            student_ids=sorted(final),
            completed_student_ids=sorted(completed),
        )
    )


@router.get("/quizzes/{quiz_id}", response_model=SuccessResponse[QuizResponse])
def get_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_VIEW)),
):
    quiz = (
        db.query(Quiz)
        .options(selectinload(Quiz.questions).joinedload(QuizQuestion.question))
        .filter(Quiz.id == quiz_id)
        .first()
    )
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return ok(quiz)


@router.post(
    "/quizzes", response_model=SuccessResponse[QuizResponse], status_code=201
)
def create_quiz(
    data: QuizCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_MANAGE)),
):
    #quiz type determined by questions types
    data.type = None

    quiz = Quiz(**data.model_dump(), status="pending")
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return ok(quiz)


def to_pending_status(quiz:Quiz = None, quiz_id:int = None):
    if(quiz == None):
        quiz = db.get(Quiz, quiz_id)    
    quiz.status = 'pending'

@router.put("/quizzes/{quiz_id}", response_model=SuccessResponse[QuizResponse])
def update_quiz(
    quiz_id: int,
    data: QuizUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_MANAGE)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    for key, value in data.model_dump().items():
        setattr(quiz, key, value)
    
    if(quiz.status != 'pending'):
        to_pending_status(quiz)

    db.commit()
    db.refresh(quiz)
    db.refresh(quiz, attribute_names=["questions"])
    return ok(quiz)


@router.delete("/quizzes/{quiz_id}", status_code=204)
def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUIZ_MANAGE)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    db.delete(quiz)
    db.commit()


@router.patch(
    "/quizzes/{quiz_id}/status", response_model=SuccessResponse[QuizResponse]
)
def set_quiz_status(
    quiz_id: int,
    data: QuizStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    quiz = (
        db.query(Quiz)
        .options(selectinload(Quiz.questions).joinedload(QuizQuestion.question))
        .filter(Quiz.id == quiz_id)
        .first()
    )
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    required = (
        PermissionCode.QUIZ_APPROVE
        if data.status == "approved"
        else PermissionCode.QUIZ_REJECT
        if data.status == "rejected"
        else PermissionCode.QUIZ_MANAGE
    )
    user_perms = {
        p.code for r in current_user.roles for p in r.permissions
    }
    if str(required.value) not in user_perms and "admin:full" not in user_perms:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    quiz.status = data.status
    db.commit()
    db.refresh(quiz)
    return ok(quiz)


# ---------------------------------------------------------------------------
# Questions (nested under quizzes)
# ---------------------------------------------------------------------------
@router.post(
    "/quizzes/{quiz_id}/questions",
    response_model=SuccessResponse[QuizQuestionResponse],
    status_code=201,
)

def create_question(
    quiz_id: int,
    data: QuizQuestionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUESTION_MANAGE)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    next_index = (
        db.query(func.coalesce(func.max(QuizQuestion.order_index), -1) + 1)
        .filter(QuizQuestion.quiz_id == quiz_id)
        .scalar()
    )

    payload = data.model_dump()
    weight = payload.pop("weight")
    if not data.existing_question_id:
        del payload["existing_question_id"]
        question = Question(**payload)
    else:
        question = db.get(Question, data.existing_question_id)        
        
    if not question:
        raise HTTPException(status_code=404, detail="Existing question not found")

    db.add(question)
    db.flush()  # assign question.id without committing yet

    quiz_question = QuizQuestion(
        quiz_id=quiz_id,
        question_id=question.id,
        weight=weight,
        order_index=int(next_index or 0),
    )
    db.add(quiz_question)
    db.commit()
    db.refresh(quiz_question)
    
    update_quiz_type_if_necessary(quiz_id, db)

    return ok(quiz_question)

def update_quiz_type_if_necessary(quiz_id:int, db: Session = Depends(get_db)):
    #get question types
    stmt = (
        select(
            Question.type
        )
        .select_from(QuizQuestion)
        .join(Question, QuizQuestion.question_id == Question.id)
        .where(QuizQuestion.quiz_id == quiz_id)
        .distinct()
    )
    type_names = db.execute(stmt).scalars().all()
    
    # update quiz type if necessary
    quiz = db.get(Quiz, quiz_id)      
    quiz.type = "mixed" if len(type_names) > 1 else type_names[0] if len(type_names) == 1 else None
    to_pending_status(quiz)
    
    db.commit()
    db.refresh(quiz)


@router.put(
    "/quizzes/{quiz_id}/questions/{question_id}",
    response_model=SuccessResponse[QuizQuestionResponse],
)
def update_question(
    quiz_id: int,
    question_id: int,
    data: QuizQuestionUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUESTION_MANAGE)),
):
    quiz_question = (
        db.query(QuizQuestion)
        .options(selectinload(QuizQuestion.question))
        .filter(QuizQuestion.id == question_id, QuizQuestion.quiz_id == quiz_id)
        .first()
    )
    if not quiz_question or not quiz_question.question:
        raise HTTPException(status_code=404, detail="Question not found")

    payload = data.model_dump()
    quiz_question.weight = payload.pop("weight")
    for key, value in payload.items():
        setattr(quiz_question.question, key, value)
    db.commit()
    db.refresh(quiz_question)
    update_quiz_type_if_necessary(quiz_id, db)


    return ok(quiz_question)


@router.delete("/quizzes/{quiz_id}/questions/{question_id}", status_code=204)
def delete_question(
    quiz_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.QUESTION_MANAGE)),
):
    quiz_question = (
        db.query(QuizQuestion)
        .options(selectinload(QuizQuestion.question))
        .filter(QuizQuestion.id == question_id, QuizQuestion.quiz_id == quiz_id)
        .first()
    )
    if not quiz_question:
        raise HTTPException(status_code=404, detail="Question not found")
    linked_question = quiz_question.question
    db.delete(quiz_question)
    if linked_question is not None:
        db.delete(linked_question)
    db.commit()
    update_quiz_type_if_necessary(quiz_id, db)


# ---------------------------------------------------------------------------
# Quiz attempts (student takes a quiz)
# ---------------------------------------------------------------------------
def _attempt_to_response(attempt: QuizAttempt) -> QuizAttemptResponse:
    results = [AttemptAnswerResult.model_validate(r) for r in (attempt.answers or [])]
    return QuizAttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        quiz_name=attempt.quiz.name if attempt.quiz else "",
        student_id=attempt.student_id,
        score=attempt.score,
        max_score=attempt.max_score,
        has_essay=attempt.has_essay,
        submitted_at=attempt.submitted_at,
        results=results,
    )


@router.post(
    "/quizzes/{quiz_id}/attempts",
    response_model=SuccessResponse[QuizAttemptResponse],
    status_code=201,
)
def submit_attempt(
    quiz_id: int,
    data: QuizAttemptSubmit,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.QUIZ_TAKE)),
):
    quiz = (
        db.query(Quiz)
        .options(selectinload(Quiz.questions).joinedload(QuizQuestion.question))
        .filter(Quiz.id == quiz_id)
        .first()
    )
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "approved":
        raise HTTPException(status_code=400, detail="Quiz is not available")
    # Local import: quiz_bank loads before the course package in MODULE_NAMES,
    # so a module-level import would be circular.
    from app.modules.course.guards import ensure_quiz_not_stopped

    ensure_quiz_not_stopped(db, quiz_id)

    by_qid = {a.question_id: a for a in data.answers}
    results: list[dict] = []
    score = 0
    max_score = 0
    has_essay = False

    for q in quiz.questions:
        weight = max(0, int(q.weight or 0))
        max_score += weight
        submitted = by_qid.get(q.id)
        student_answer = submitted.answer if submitted else []
        student_text = submitted.text if submitted else None

        correct = False
        needs_review = False

        if q.type == "multiple_choice":
            correct = sorted([s.strip() for s in student_answer]) == sorted(
                [a.strip() for a in (q.answers or [])]
            )
        elif q.type == "true_false":
            picked = (student_answer[0] if student_answer else "").lower()
            expected = ((q.answers[0] if q.answers else "") or "").lower()
            correct = picked == expected and picked in ("true", "false")
        elif q.type == "essay":
            # Essays are not auto-graded; surface for teacher review.
            has_essay = True
            needs_review = bool((student_text or "").strip())
            correct = False

        awarded = weight if correct else 0
        score += awarded
        results.append(
            {
                "question_id": q.id,
                "correct": correct,
                "awarded": awarded,
                "weight": weight,
                "needs_review": needs_review,
                "answer": list(student_answer or []),
                "text": student_text,
            }
        )

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        student_id=current_user.id,
        score=score,
        max_score=max_score,
        has_essay=has_essay,
        answers=results,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    # Re-fetch with quiz relation populated.
    attempt = (
        db.query(QuizAttempt)
        .options(selectinload(QuizAttempt.quiz))
        .filter(QuizAttempt.id == attempt.id)
        .first()
    )
    return ok(_attempt_to_response(attempt))


@router.get(
    "/attempts",
    response_model=SuccessResponse[list[QuizAttemptResponse]],
)
def list_my_attempts(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.QUIZ_TAKE)),
):
    attempts = (
        db.query(QuizAttempt)
        .options(selectinload(QuizAttempt.quiz))
        .filter(QuizAttempt.student_id == current_user.id)
        .order_by(QuizAttempt.submitted_at.desc())
        .all()
    )
    return ok([_attempt_to_response(a) for a in attempts])
