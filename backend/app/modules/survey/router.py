import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload,joinedload
from datetime import datetime
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok


from app.modules.course.guards import ensure_survey_not_stopped

from .models import (Survey, SurveyQuestion, SurveyQuestionPool,SurveyPoolAnswerOption,SurveyQuestion,SurveyAnswerOption,StudentResponse,SurveyRecipient)
from .schemas import (
	SurveyCreate,
	SurveyResponse,
	SurveyUpdate,
	SurveyQuestionCreate,
	SurveyAnswerOptionCreate,
	SurveyQuestionBase,
	SurveyAnswerOptionBase,
	SurveyQuestionResponse,
	SurveyQuestionPoolResponse,
	SurveyQuestionPoolCreate,
	SurveyAnswerOptionResponse,
	StudentResponseCreate,
	StudentResponseResponse,
	StudentResponseUpdate,
	SurveyTakerResponse,
	RecipientsResponse,
	RecipientsUpdate

	)

from app.modules.users.models import User, Role, Permission


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/survey", tags=["Survey"])


# Create Survey
@router.post("/surveys",response_model=SuccessResponse[SurveyResponse],status_code=201)
def create_survey(
	payload:SurveyCreate,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	try:
		survey=Survey(
			title = payload.title,
			description = payload.description,
			status = payload.status,
			scheduled_at = payload.scheduled_at,
			course_id = payload.course_id,
			assignment_type = payload.assignment_type,
			assignee_id = payload.assignee_id
		)
		db.add(survey)
		db.commit()
		if not survey:raise HTTPException(status_code=404,detail="Survey not found") 
		return ok(survey)
	except Exception as e:
		db.rollback()
		raise HTTPException(status_code=500,detail=str(e))

# List users eligible to take surveys (for the "assign to specific user" combo box)
@router.get("/eligible-takers",response_model=SuccessResponse[list[SurveyTakerResponse]])
def list_eligible_takers(
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	users = (
		db.query(User)
		.join(User.roles)
		.join(Role.permissions)
		.filter(
			Permission.code == PermissionCode.SURVEY_TAKE.value,
			User.is_active == True,
		)
		.distinct()
		.all()
	)
	# ``User.full_name`` is a computed property (derived from the related Profile),
	# not a mapped column, so it can't be used in SQL ORDER BY. Sort in Python.
	users.sort(key=lambda u: (u.full_name or u.username or "").lower())
	return ok(users)

# List Surveys
@router.get("/surveys",response_model=SuccessResponse[list[SurveyResponse]])
def list_surveys(
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_VIEW))
):
	survyes = (
	db.query(Survey)
	.options(selectinload(Survey.questions).joinedload(SurveyQuestion.options))
	.order_by(Survey.id)
	.all()
	)
	return ok(survyes)

# ---------------------------------------------------------------------------
# Sending a survey directly to students (no course / lesson link)
# ---------------------------------------------------------------------------
@router.get("/surveys/assigned",response_model=SuccessResponse[list[SurveyResponse]])
def list_assigned_surveys(
	db:Session=Depends(get_db),
	current_user=Depends(require_permission(PermissionCode.SURVEY_TAKE))
):
	"""A student's surveys: published, send-time passed, sent to them, not finished.

	In-progress responses (started, not finished) stay visible so the student can
	resume; only a finished response removes the survey from the list.

	"Sent to them" covers both a direct send (survey_recipients) and a per-lesson
	release from Schedule Management (course_selection_lesson_releases, keyed by
	the student's profile id).
	"""
	from app.modules.course_selection_schedule.lesson_content_models import (
		CourseSelectionLessonRelease,
	)

	assigned_ids = {
		row[0]
		for row in db.query(SurveyRecipient.survey_id)
		.filter(SurveyRecipient.student_id == current_user.id)
		.all()
	}
	profile_id = current_user.profile.id if current_user.profile else None
	if profile_id is not None:
		assigned_ids |= {
			row[0]
			for row in db.query(CourseSelectionLessonRelease.content_id)
			.filter(
				CourseSelectionLessonRelease.content_type == "survey",
				CourseSelectionLessonRelease.student_id == profile_id,
			)
			.all()
		}
	if not assigned_ids:
		return ok([])
	# student_id is Text, so compare against the string form of the users.id.
	finished_ids = {
		row[0]
		for row in db.query(StudentResponse.survey_id)
		.filter(
			StudentResponse.student_id == str(current_user.id),
			StudentResponse.is_finished == True,
		)
		.all()
	}
	visible_ids = assigned_ids - finished_ids
	if not visible_ids:
		return ok([])
	now = datetime.utcnow()
	surveys = (
		db.query(Survey)
		.options(selectinload(Survey.questions).joinedload(SurveyQuestion.options))
		.filter(Survey.id.in_(visible_ids), Survey.status == "published")
		.order_by(Survey.id)
		.all()
	)

	def _released(s: Survey) -> bool:
		if s.scheduled_at is None:
			return True
		if s.scheduled_at.tzinfo is not None:
			from datetime import timezone as _tz
			return s.scheduled_at <= datetime.now(_tz.utc)
		return s.scheduled_at <= now

	surveys = [s for s in surveys if _released(s)]
	return ok(surveys)


def _survey_completed_student_ids(db: Session, survey_id: int) -> list[int]:
	rows = (
		db.query(StudentResponse.student_id)
		.filter(
			StudentResponse.survey_id == survey_id,
			StudentResponse.is_finished == True,
		)
		.distinct()
		.all()
	)
	return [int(r[0]) for r in rows if r[0] is not None and str(r[0]).isdigit()]


@router.get("/surveys/{survey_id}/recipients",response_model=SuccessResponse[RecipientsResponse])
def get_survey_recipients(
	survey_id:int,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	survey=db.get(Survey,survey_id)
	if not survey:
		raise HTTPException(status_code=404,detail="Survey not found")
	student_ids=[
		row[0]
		for row in db.query(SurveyRecipient.student_id)
		.filter(SurveyRecipient.survey_id==survey_id)
		.all()
	]
	return ok(
		RecipientsResponse(
			student_ids=student_ids,
			completed_student_ids=_survey_completed_student_ids(db,survey_id),
		)
	)


@router.put("/surveys/{survey_id}/recipients",response_model=SuccessResponse[RecipientsResponse])
def set_survey_recipients(
	survey_id:int,
	data:RecipientsUpdate,
	db:Session=Depends(get_db),
	current_user=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	survey=db.get(Survey,survey_id)
	if not survey:
		raise HTTPException(status_code=404,detail="Survey not found")
	if survey.status != "published":
		raise HTTPException(
			status_code=400,
			detail="Publish this survey before sending it to students.",
		)

	completed=set(_survey_completed_student_ids(db,survey_id))
	existing={
		row[0]
		for row in db.query(SurveyRecipient.student_id)
		.filter(SurveyRecipient.survey_id==survey_id)
		.all()
	}
	final=set(data.student_ids)|completed
	to_add=final-existing
	to_remove=existing-final

	if to_remove:
		db.query(SurveyRecipient).filter(
			SurveyRecipient.survey_id==survey_id,
			SurveyRecipient.student_id.in_(to_remove),
		).delete(synchronize_session=False)
	for sid in to_add:
		db.add(SurveyRecipient(survey_id=survey_id,student_id=sid,sent_by=current_user.id))
	db.commit()

	return ok(
		RecipientsResponse(
			student_ids=sorted(final),
			completed_student_ids=sorted(completed),
		)
	)


# Get Survey by survey id
@router.get("/surveys/{survey_id}",response_model=SuccessResponse[SurveyResponse])
def get_survey(
	survey_id:int,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_VIEW))
):
	survey=(
	db.query(Survey)
	# .options(selectinload(Survey.questions).joinedload(SurveyQuestionBase.question))
	.filter(Survey.id == survey_id)
	.first()
	)
	 
	return ok(survey)


# Update Survey
@router.put("/surveys/{survey_id}",response_model=SuccessResponse[SurveyResponse])
def update_survey(
	survey_id:int,
	data:SurveyUpdate,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	survey=db.get(Survey,survey_id)
	if not survey:
		raise HTTPException(status_code=404,detail="Survey not found")
	# Only update fields the client actually sent so partial updates don't
	# wipe scheduling / assignment values back to their defaults.
	for key,value in data.model_dump(exclude_unset=True).items():
		setattr(survey,key,value)

	db.commit()
	db.refresh(survey)
	db.refresh(survey)
	return ok(survey)

# Remove Survey
@router.delete("/surveys/{survey_id}",status_code=204)
def remove_survey(
	survey_id:int,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	survey=db.get(Survey,survey_id)
	if not survey:
		raise HTTPException(status_code=404,detail="Survey not found")
	db.delete(survey)
	db.commit()


 # Create Question 
@router.post("/surveys/{survey_id}/questions",response_model=SuccessResponse[SurveyQuestionResponse],status_code=201)
def create_question(
	survey_id:int,
	data:SurveyQuestionCreate,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	survey=db.query(Survey).filter(Survey.id== survey_id).first()
	if not survey:
		raise HTTPException(status_code=404,detail="Survey not found")

	# Convert 0 or invalid pool_question_id to None
	pool_question_id = data.pool_question_id
	if pool_question_id == 0 or pool_question_id is None:
		pool_question_id=None
	else:
		pool_question=db.query(SurveyQuestionPool).filter(SurveyQuestionPool.id == pool_question_id).first()
		if not pool_question:
			raise HTTPException(status_code=404,detail=f"Pool question {pool_question_id} not found")
	
	question = SurveyQuestion(
		survey_id= survey_id,
		pool_question_id=pool_question_id,
		text=data.text,
		type=data.type,
		allow_multiple=data.allow_multiple,
		weight=data.weight,
		required=data.required
	)
	db.add(question)
	db.flush()

	if data is not None and data.options:
		for opt in data.options:
			db.add(SurveyAnswerOption(
				question_id=question.id,
				text=opt.text,
				weight=opt.weight
			))
		
	db.commit()
	db.refresh(question)
	return ok(question)


# Update Question
@router.put("/surveys/{survey_id}/questions/{question_id}",response_model=SuccessResponse[SurveyQuestionResponse])
def update_question(survey_id:int, question_id:int,data:SurveyQuestionCreate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	question = db.query(SurveyQuestion).filter(SurveyQuestion.id == question_id, SurveyQuestion.survey_id == survey_id).first()

	if not question:
		raise HTTPException(status_code=404,detail="Question not fouund")
	
	#Update Question Fields
	question.text = data.text
	question.type= data.type
	question.allow_multiple= data.allow_multiple
	question.weight = data.weight
	question.required= data.required

	pool_question_id = data.pool_question_id
	if pool_question_id == 0 or pool_question_id is None:
		question.pool_question_id = None
	else:
		question.pool_question_id = pool_question_id
	
	# Delete existing options and add new ones
	db.query(SurveyAnswerOption).filter(SurveyAnswerOption.question_id == question_id).delete()

	for opt in data.options:
		db.add(SurveyAnswerOption(
			question_id=question.id,
			text=opt.text,
			weight=opt.weight
		))
	
	db.commit()
	db.refresh(question)
	return ok(question)

# Delete question
@router.delete("/surveys/{survey_id}/questions/{question_id}",status_code=204)
def delete_question(survey_id:int,question_id:int,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	question = db.query(SurveyQuestion).filter(SurveyQuestion.id == question_id, SurveyQuestion.survey_id== survey_id).first()
	if not question:
		raise HTTPException(status_code=404, detail="Question not found")
	db.delete(question)
	db.commit()


# Create Question Pool Item
@router.post("/pool/question-pool",response_model=SuccessResponse[SurveyQuestionPoolResponse],status_code=201)
def create_question_pool_item(
	data:SurveyQuestionPoolCreate,
	db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	pool_item = SurveyQuestionPool(
		text= data.text,
		type=data.type,
		allow_multiple=data.allow_multiple,
		weight=data.weight,
		required=data.required
	)
	db.add(pool_item)
	db.flush()

	for opt in data.options:
		db.add(SurveyPoolAnswerOption(
			question_id=pool_item.id,
			text=opt.text,
			weight=opt.weight
		))
	
	db.commit()
	db.refresh(pool_item)
	return ok(pool_item)

# Get all questions from the pool
@router.get("/pool/question-pool",response_model=SuccessResponse[list[SurveyQuestionPoolResponse]])
def list_pool_questions(db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	pool_questions = db.query(SurveyQuestionPool).all()
	return ok(pool_questions)


# Get a specific pool question
@router.get("/pool/question-pool/{question_pool_id}",response_model=SuccessResponse[SurveyQuestionPoolResponse])
def get_pool_question(question_pool_id:int,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	pool_question = db.query(SurveyQuestionPool).filter(SurveyQuestionPool.id == question_pool_id).first()

	if not pool_question:
		raise HTTPException(status_code=404, detail="Pool question not found")
	return ok(pool_question)

# Update pool question
@router.put("/pool/question-pool/{question_pool_id}",response_model=SuccessResponse[SurveyQuestionPoolResponse])
def update_pool_question(question_pool_id:int,data:SurveyQuestionPoolCreate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	pool_question = db.query(SurveyQuestionPool).filter(SurveyQuestionPool.id == question_pool_id).first()

	if not pool_question:
		raise HTTPException(status_code=404, detail="Pool question not found")
	
	pool_question.text = data.text
	pool_question.type = data.type
	pool_question.allow_multiple = data.allow_multiple
	pool_question.weight = data.weight
	pool_question.required = data.required

	# Delete and recreate options
	db.query(SurveyPoolAnswerOption).filter(SurveyPoolAnswerOption.question_id == question_pool_id).delete()

	for opt in data.options:
		db.add(SurveyPoolAnswerOption(
			question_id=pool_question.id,
			text=opt.text,
			weight=opt.weight
		))
	db.commit()
	db.refresh(pool_question)
	return ok(pool_question)

# Delete pool question
@router.delete("/pool/question-pool/{question_pool_id}",status_code=204)
def delete_pool_question(question_pool_id:int,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	pool_question = db.query(SurveyQuestionPool).filter(SurveyQuestionPool.id == question_pool_id).first()
	if not pool_question:
		raise HTTPException(status_code=404,detail="Pool question not found")
	
	db.delete(pool_question)
	db.commit()


# =============Answer Option EndPoints ====================

# Add an option to a question
@router.post("/surveys/questions/{question_id}/options",response_model=SuccessResponse[SurveyAnswerOptionResponse],status_code=201)
def add_option(question_id:int,data:SurveyAnswerOptionCreate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	question = db.query(SurveyQuestion).filter(SurveyQuestion.id==question_id).first()

	if not question:
		raise HTTPException(status_code=404,detail="Question not found")

	option = SurveyAnswerOption(
		question_id= question.id,
		text=data.text,
		weight=data.weight
	)
	db.add(option)
	db.commit()
	db.refresh(option)
	return ok(option)

# Update an option in a question
@router.put("/surveys/questions/{question_id}/options/{option_id}",response_model=SuccessResponse[SurveyAnswerOptionResponse])
def update_option(question_id:int,option_id:int,data:SurveyAnswerOptionCreate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	option = db.query(SurveyAnswerOption).filter(SurveyAnswerOption.id == option_id, SurveyAnswerOption.question_id == question_id).first()

	if not option:
		raise HTTPException(status_code=404,detail="Option not found")

	option.text = data.text
	option.weight=data.weight

	db.commit()
	db.refresh(option)
	return ok(option)

# Delete an option in a question
@router.delete("/surveys/questions/{question_id}/options/{option_id}")
def delete_option(question_id:int,option_id:int,data:SurveyAnswerOptionCreate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_CREATOR))
):
	option = db.query(SurveyAnswerOption).filter(SurveyAnswerOption.id == option_id, SurveyAnswerOption.question_id == question_id).first()

	if not option:
		raise HTTPException(status_code=404,detail="Option not found")
	
	db.delete(option)
	db.commit()


# Create Student Response
@router.post("/surveys/studentrespones/",response_model=SuccessResponse[StudentResponseResponse],status_code=201)
def create_student_response(data:StudentResponseCreate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_TAKE))
):
	survey=db.query(Survey).filter(Survey.id== data.survey_id).first()
	if not survey:
		raise HTTPException(status_code=404,detail="Survey not found")
	ensure_survey_not_stopped(db, data.survey_id)

	started_at = data.started_at or datetime.utcnow()

	response = StudentResponse(
		survey_id = data.survey_id,
		student_id  = data.student_id,
		answers = data.answers,
		question_times = data.question_times,
		started_at = started_at,
		completed_at = data.completed_at,
		is_started = data.is_started,
		is_finished = data.is_finished,
		current_index =data.current_index,
		overall_grade = data.overall_grade
	)
	db.add(response)
	db.commit()
	db.refresh(response)
	return ok(response)

# List student reponse
@router.get("/surveys/studentrespones/",response_model=SuccessResponse[list[StudentResponseResponse]])
def list_student_response(db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_TAKE))
):
	responses = (
	db.query(StudentResponse)
	.options(selectinload(StudentResponse.survey))
	.order_by(StudentResponse.id)
	.all()
	)
	# responses = db.query(StudentResponse).all()
	return ok(responses)

# Get Student Response
@router.get("/surveys/studentrespones/{response_id}",response_model=SuccessResponse[StudentResponseResponse])
def get_student_response(response_id:int,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_TAKE))
):
	response = db.query(StudentResponse).filter(StudentResponse.id == response_id).first()
	if not response:
		raise HTTPException(status_code=404,detail="Student response not found.")
	return ok(response)


# Update student response
@router.put("/surveys/studentrespones/{response_id}",response_model=SuccessResponse[StudentResponseResponse])
def update_student_response(response_id:int,data:StudentResponseUpdate,db:Session=Depends(get_db),
	_=Depends(require_permission(PermissionCode.SURVEY_TAKE))
):
	response = db.query(StudentResponse).filter(StudentResponse.id == response_id).first()
	if not response:
		raise HTTPException(status_code=404,detail="Student response not found.")
	ensure_survey_not_stopped(db, response.survey_id)

	if data.answers is not None:
		response.answers= data.answers
	if data.question_times is not None:
		response.question_times= data.question_times
	if data.is_started is not None:
		response.is_started= data.is_started
	if data.is_finished is not None:
		response.is_finished= data.is_finished
	if data.current_index is not None:
		response.current_index= data.current_index
	if data.overall_grade is not None:
		response.overall_grade= data.overall_grade
	if data.completed_at is not None:
		response.completed_at= data.completed_at

	db.commit()
	db.refresh(response)
	return ok(response)