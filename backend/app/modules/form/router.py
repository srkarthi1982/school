import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from datetime import datetime
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.course.guards import ensure_form_not_stopped


from .models import (
    Form,
    FormQuestion,
    FormQuestionPool,
    FormPoolAnswerOption,
    FormAnswerOption,
    FormStudentResponse,
    FormRecipient,
)
from .schemas import (
    FormCreate,
    FormResponse,
    FormUpdate,
    FormQuestionCreate,
    FormAnswerOptionCreate,
    FormQuestionResponse,
    FormQuestionPoolResponse,
    FormQuestionPoolCreate,
    FormAnswerOptionResponse,
    FormStudentResponseCreate,
    FormStudentResponseResponse,
    FormStudentResponseUpdate,
    FormTakerResponse,
    RecipientsResponse,
    RecipientsUpdate,
)

from app.modules.users.models import User, Role, Permission


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/form", tags=["Form"])


# Create Form
@router.post("/forms", response_model=SuccessResponse[FormResponse], status_code=201)
def create_form(
    payload: FormCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    try:
        form = Form(
            title=payload.title,
            description=payload.description,
            status=payload.status,
            scheduled_at=payload.scheduled_at,
            course_id=payload.course_id,
            assignment_type=payload.assignment_type,
            assignee_id=payload.assignee_id,
        )
        db.add(form)
        db.commit()
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")
        return ok(form)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# List users eligible to take forms (for the "assign to specific user" combo box)
@router.get("/eligible-takers", response_model=SuccessResponse[list[FormTakerResponse]])
def list_eligible_takers(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    users = (
        db.query(User)
        .join(User.roles)
        .join(Role.permissions)
        .filter(
            Permission.code == PermissionCode.FORM_TAKE.value,
            User.is_active == True,
        )
        .distinct()
        .all()
    )
    # ``User.full_name`` is a computed property (derived from the related
    # Profile), not a mapped column, so it can't be used in SQL ORDER BY.
    # Sort by the displayed name in Python instead.
    users.sort(key=lambda u: (u.full_name or u.username or "").lower())
    return ok(users)


# List Forms
@router.get("/forms", response_model=SuccessResponse[list[FormResponse]])
def list_forms(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_VIEW)),
):
    forms = (
        db.query(Form)
        .options(selectinload(Form.questions).joinedload(FormQuestion.options))
        .order_by(Form.id)
        .all()
    )
    return ok(forms)


# ---------------------------------------------------------------------------
# Sending a form directly to students (no course / lesson link)
# ---------------------------------------------------------------------------
@router.get("/forms/assigned", response_model=SuccessResponse[list[FormResponse]])
def list_assigned_forms(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FORM_TAKE)),
):
    """A student's forms: published, send-time passed, sent to them, not finished.

    In-progress responses (started, not finished) stay visible so the student can
    resume; only a finished response removes the form from the list.

    "Sent to them" covers both a direct send (form_recipients) and a per-lesson
    release from Schedule Management (course_selection_lesson_releases, keyed by
    the student's profile id).
    """
    from app.modules.course_selection_schedule.lesson_content_models import (
        CourseSelectionLessonRelease,
    )

    assigned_ids = {
        row[0]
        for row in db.query(FormRecipient.form_id)
        .filter(FormRecipient.student_id == current_user.id)
        .all()
    }
    profile_id = current_user.profile.id if current_user.profile else None
    if profile_id is not None:
        assigned_ids |= {
            row[0]
            for row in db.query(CourseSelectionLessonRelease.content_id)
            .filter(
                CourseSelectionLessonRelease.content_type == "form",
                CourseSelectionLessonRelease.student_id == profile_id,
            )
            .all()
        }
    if not assigned_ids:
        return ok([])
    # Forms this student has finished — student_id is Text, so compare to the string.
    finished_ids = {
        row[0]
        for row in db.query(FormStudentResponse.form_id)
        .filter(
            FormStudentResponse.student_id == str(current_user.id),
            FormStudentResponse.is_finished == True,
        )
        .all()
    }
    visible_ids = assigned_ids - finished_ids
    if not visible_ids:
        return ok([])
    now = datetime.utcnow()
    forms = (
        db.query(Form)
        .options(selectinload(Form.questions).joinedload(FormQuestion.options))
        .filter(Form.id.in_(visible_ids), Form.status == "published")
        .order_by(Form.id)
        .all()
    )
    # scheduled_at may be tz-aware; compare defensively.
    def _released(f: Form) -> bool:
        if f.scheduled_at is None:
            return True
        sched = f.scheduled_at
        ref = now
        if sched.tzinfo is not None:
            from datetime import timezone as _tz
            ref = datetime.now(_tz.utc)
        return sched <= ref

    forms = [f for f in forms if _released(f)]
    return ok(forms)


def _form_completed_student_ids(db: Session, form_id: int) -> list[int]:
    rows = (
        db.query(FormStudentResponse.student_id)
        .filter(
            FormStudentResponse.form_id == form_id,
            FormStudentResponse.is_finished == True,
        )
        .distinct()
        .all()
    )
    return [int(r[0]) for r in rows if r[0] is not None and str(r[0]).isdigit()]


@router.get(
    "/forms/{form_id}/recipients",
    response_model=SuccessResponse[RecipientsResponse],
)
def get_form_recipients(
    form_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    student_ids = [
        row[0]
        for row in db.query(FormRecipient.student_id)
        .filter(FormRecipient.form_id == form_id)
        .all()
    ]
    return ok(
        RecipientsResponse(
            student_ids=student_ids,
            completed_student_ids=_form_completed_student_ids(db, form_id),
        )
    )


@router.put(
    "/forms/{form_id}/recipients",
    response_model=SuccessResponse[RecipientsResponse],
)
def set_form_recipients(
    form_id: int,
    data: RecipientsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    if form.status != "published":
        raise HTTPException(
            status_code=400,
            detail="Publish this form before sending it to students.",
        )

    completed = set(_form_completed_student_ids(db, form_id))
    existing = {
        row[0]
        for row in db.query(FormRecipient.student_id)
        .filter(FormRecipient.form_id == form_id)
        .all()
    }
    final = set(data.student_ids) | completed
    to_add = final - existing
    to_remove = existing - final

    if to_remove:
        db.query(FormRecipient).filter(
            FormRecipient.form_id == form_id,
            FormRecipient.student_id.in_(to_remove),
        ).delete(synchronize_session=False)
    for sid in to_add:
        db.add(FormRecipient(form_id=form_id, student_id=sid, sent_by=current_user.id))
    db.commit()

    return ok(
        RecipientsResponse(
            student_ids=sorted(final),
            completed_student_ids=sorted(completed),
        )
    )


# Get Form by form id
@router.get("/forms/{form_id}", response_model=SuccessResponse[FormResponse])
def get_form(
    form_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_VIEW)),
):
    form = (
        db.query(Form)
        .filter(Form.id == form_id)
        .first()
    )
    return ok(form)


# Update Form
@router.put("/forms/{form_id}", response_model=SuccessResponse[FormResponse])
def update_form(
    form_id: int,
    data: FormUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    # Only update fields the client actually sent so partial updates don't wipe
    # scheduling / assignment values back to their defaults.
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(form, key, value)

    db.commit()
    db.refresh(form)
    return ok(form)


# Remove Form
@router.delete("/forms/{form_id}", status_code=204)
def remove_form(
    form_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()


# Create Question
@router.post("/forms/{form_id}/questions", response_model=SuccessResponse[FormQuestionResponse], status_code=201)
def create_question(
    form_id: int,
    data: FormQuestionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    form = db.query(Form).filter(Form.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Convert 0 or invalid pool_question_id to None
    pool_question_id = data.pool_question_id
    if pool_question_id == 0 or pool_question_id is None:
        pool_question_id = None
    else:
        pool_question = db.query(FormQuestionPool).filter(FormQuestionPool.id == pool_question_id).first()
        if not pool_question:
            raise HTTPException(status_code=404, detail=f"Pool question {pool_question_id} not found")

    question = FormQuestion(
        form_id=form_id,
        pool_question_id=pool_question_id,
        text=data.text,
        type=data.type,
        allow_multiple=data.allow_multiple,
        weight=data.weight,
        required=data.required,
    )
    db.add(question)
    db.flush()

    if data is not None and data.options:
        for opt in data.options:
            db.add(FormAnswerOption(
                question_id=question.id,
                text=opt.text,
                weight=opt.weight,
            ))

    db.commit()
    db.refresh(question)
    return ok(question)


# Update Question
@router.put("/forms/{form_id}/questions/{question_id}", response_model=SuccessResponse[FormQuestionResponse])
def update_question(
    form_id: int,
    question_id: int,
    data: FormQuestionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    question = db.query(FormQuestion).filter(FormQuestion.id == question_id, FormQuestion.form_id == form_id).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Update Question Fields
    question.text = data.text
    question.type = data.type
    question.allow_multiple = data.allow_multiple
    question.weight = data.weight
    question.required = data.required

    pool_question_id = data.pool_question_id
    if pool_question_id == 0 or pool_question_id is None:
        question.pool_question_id = None
    else:
        question.pool_question_id = pool_question_id

    # Delete existing options and add new ones
    db.query(FormAnswerOption).filter(FormAnswerOption.question_id == question_id).delete()

    for opt in data.options:
        db.add(FormAnswerOption(
            question_id=question.id,
            text=opt.text,
            weight=opt.weight,
        ))

    db.commit()
    db.refresh(question)
    return ok(question)


# Delete question
@router.delete("/forms/{form_id}/questions/{question_id}", status_code=204)
def delete_question(
    form_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    question = db.query(FormQuestion).filter(FormQuestion.id == question_id, FormQuestion.form_id == form_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(question)
    db.commit()


# Create Question Pool Item
@router.post("/pool/question-pool", response_model=SuccessResponse[FormQuestionPoolResponse], status_code=201)
def create_question_pool_item(
    data: FormQuestionPoolCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    pool_item = FormQuestionPool(
        text=data.text,
        type=data.type,
        allow_multiple=data.allow_multiple,
        weight=data.weight,
        required=data.required,
    )
    db.add(pool_item)
    db.flush()

    for opt in data.options:
        db.add(FormPoolAnswerOption(
            question_id=pool_item.id,
            text=opt.text,
            weight=opt.weight,
        ))

    db.commit()
    db.refresh(pool_item)
    return ok(pool_item)


# Get all questions from the pool
@router.get("/pool/question-pool", response_model=SuccessResponse[list[FormQuestionPoolResponse]])
def list_pool_questions(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    pool_questions = db.query(FormQuestionPool).all()
    return ok(pool_questions)


# Get a specific pool question
@router.get("/pool/question-pool/{question_pool_id}", response_model=SuccessResponse[FormQuestionPoolResponse])
def get_pool_question(
    question_pool_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    pool_question = db.query(FormQuestionPool).filter(FormQuestionPool.id == question_pool_id).first()

    if not pool_question:
        raise HTTPException(status_code=404, detail="Pool question not found")
    return ok(pool_question)


# Update pool question
@router.put("/pool/question-pool/{question_pool_id}", response_model=SuccessResponse[FormQuestionPoolResponse])
def update_pool_question(
    question_pool_id: int,
    data: FormQuestionPoolCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    pool_question = db.query(FormQuestionPool).filter(FormQuestionPool.id == question_pool_id).first()

    if not pool_question:
        raise HTTPException(status_code=404, detail="Pool question not found")

    pool_question.text = data.text
    pool_question.type = data.type
    pool_question.allow_multiple = data.allow_multiple
    pool_question.weight = data.weight
    pool_question.required = data.required

    # Delete and recreate options
    db.query(FormPoolAnswerOption).filter(FormPoolAnswerOption.question_id == question_pool_id).delete()

    for opt in data.options:
        db.add(FormPoolAnswerOption(
            question_id=pool_question.id,
            text=opt.text,
            weight=opt.weight,
        ))
    db.commit()
    db.refresh(pool_question)
    return ok(pool_question)


# Delete pool question
@router.delete("/pool/question-pool/{question_pool_id}", status_code=204)
def delete_pool_question(
    question_pool_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    pool_question = db.query(FormQuestionPool).filter(FormQuestionPool.id == question_pool_id).first()
    if not pool_question:
        raise HTTPException(status_code=404, detail="Pool question not found")

    db.delete(pool_question)
    db.commit()


# =============Answer Option EndPoints ====================

# Add an option to a question
@router.post("/forms/questions/{question_id}/options", response_model=SuccessResponse[FormAnswerOptionResponse], status_code=201)
def add_option(
    question_id: int,
    data: FormAnswerOptionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    question = db.query(FormQuestion).filter(FormQuestion.id == question_id).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    option = FormAnswerOption(
        question_id=question.id,
        text=data.text,
        weight=data.weight,
    )
    db.add(option)
    db.commit()
    db.refresh(option)
    return ok(option)


# Update an option in a question
@router.put("/forms/questions/{question_id}/options/{option_id}", response_model=SuccessResponse[FormAnswerOptionResponse])
def update_option(
    question_id: int,
    option_id: int,
    data: FormAnswerOptionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    option = db.query(FormAnswerOption).filter(FormAnswerOption.id == option_id, FormAnswerOption.question_id == question_id).first()

    if not option:
        raise HTTPException(status_code=404, detail="Option not found")

    option.text = data.text
    option.weight = data.weight

    db.commit()
    db.refresh(option)
    return ok(option)


# Delete an option in a question
@router.delete("/forms/questions/{question_id}/options/{option_id}")
def delete_option(
    question_id: int,
    option_id: int,
    data: FormAnswerOptionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_CREATOR)),
):
    option = db.query(FormAnswerOption).filter(FormAnswerOption.id == option_id, FormAnswerOption.question_id == question_id).first()

    if not option:
        raise HTTPException(status_code=404, detail="Option not found")

    db.delete(option)
    db.commit()


# Create Student Response
@router.post("/forms/studentrespones/", response_model=SuccessResponse[FormStudentResponseResponse], status_code=201)
def create_student_response(
    data: FormStudentResponseCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_TAKE)),
):
    form = db.query(Form).filter(Form.id == data.form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    ensure_form_not_stopped(db, data.form_id)

    started_at = data.started_at or datetime.utcnow()

    response = FormStudentResponse(
        form_id=data.form_id,
        student_id=data.student_id,
        answers=data.answers,
        question_times=data.question_times,
        started_at=started_at,
        completed_at=data.completed_at,
        is_started=data.is_started,
        is_finished=data.is_finished,
        current_index=data.current_index,
        overall_grade=data.overall_grade,
    )
    db.add(response)
    db.commit()
    db.refresh(response)
    return ok(response)


# List student response
@router.get("/forms/studentrespones/", response_model=SuccessResponse[list[FormStudentResponseResponse]])
def list_student_response(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_TAKE)),
):
    responses = (
        db.query(FormStudentResponse)
        .options(selectinload(FormStudentResponse.form))
        .order_by(FormStudentResponse.id)
        .all()
    )
    return ok(responses)


# Get Student Response
@router.get("/forms/studentrespones/{response_id}", response_model=SuccessResponse[FormStudentResponseResponse])
def get_student_response(
    response_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_TAKE)),
):
    response = db.query(FormStudentResponse).filter(FormStudentResponse.id == response_id).first()
    if not response:
        raise HTTPException(status_code=404, detail="Student response not found.")
    return ok(response)


# Update student response
@router.put("/forms/studentrespones/{response_id}", response_model=SuccessResponse[FormStudentResponseResponse])
def update_student_response(
    response_id: int,
    data: FormStudentResponseUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_TAKE)),
):
    response = db.query(FormStudentResponse).filter(FormStudentResponse.id == response_id).first()
    if not response:
        raise HTTPException(status_code=404, detail="Student response not found.")
    ensure_form_not_stopped(db, response.form_id)

    if data.answers is not None:
        response.answers = data.answers
    if data.question_times is not None:
        response.question_times = data.question_times
    if data.is_started is not None:
        response.is_started = data.is_started
    if data.is_finished is not None:
        response.is_finished = data.is_finished
    if data.current_index is not None:
        response.current_index = data.current_index
    if data.overall_grade is not None:
        response.overall_grade = data.overall_grade
    if data.completed_at is not None:
        response.completed_at = data.completed_at

    db.commit()
    db.refresh(response)
    return ok(response)
