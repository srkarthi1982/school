from datetime import datetime

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db
from datetime import date
from sqlalchemy.orm import selectinload, with_loader_criteria
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import ApiResponse, SuccessResponse, ok
from app.core.schemas import apply_sort, paginate
from app.core.esnaad import EsnaadService
from sqlalchemy import asc, desc

from .models import ProfileAIRF, ProfileAIRFItem, ProfileCurrency, ProfileCurrencyItem, ProfileExperience, ProfileFitness, ProfileModificationRequest, ProfilePlatform, Student, Teacher, Profile
from ..enrollment.models import Enrollment
from ..attendance.models import Attendance
#from ..users.models import User

from .schemas import (
    StudentCreate,
    StudentResponse,
    StudentUpdate,
    TeacherCreate,
    TeacherResponse,
    TeacherUpdate,
    UserProfileUpdate,
    PersonalInformation
)

from . import schemas as s
from .services import build_profile_change_description


logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Students
# ---------------------------------------------------------------------------
student_router = APIRouter(prefix="/students", tags=["Students"])


@student_router.get("/", response_model=SuccessResponse[list[StudentResponse]])
def list_students(
    program_id: int | None = None,
    student_id: str | None = Query(
        None, description="Partial match on student_id"),
    user_id: int | None = None,
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    attendance_date: date | None = Query(None, description="Filter attendances by date"),
    section_id: int | None = Query(None, description="Filter attendances by section id"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Student).options(selectinload(Student.attendances))
    if attendance_date:
        query = query.options(with_loader_criteria(Attendance, lambda cls: cls.date == attendance_date))
    if section_id is not None:
        query = query.join(Student.enrollments).filter(Enrollment.section_id == section_id)
    if section_id is not None:
        query = query.options(with_loader_criteria(Attendance, lambda cls: cls.section_id == section_id))
    else:
        query = query.options(with_loader_criteria(Attendance, lambda cls: cls.section_id == None))
    if program_id:
        query = query.filter(Student.program_id == program_id)
    if user_id:
        query = query.filter(Student.user_id == user_id)
    # Handle sorting, including related fields like User.full_name
    if sort_by == "full_name":
        # Join the User table to sort by the user's full name
        from ..users.models import User  # Local import to avoid circular dependencies
        query = query.join(User, Student.user_id == User.id).order_by(
            asc(User.full_name) if sort_order == "asc" else desc(User.full_name)
        )
    else:
        query = apply_sort(query, Student, sort_by, sort_order)
    return paginate(query, page, page_size)


@student_router.get("/{student_id}", response_model=SuccessResponse[StudentResponse])
def get_student(student_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    student = db.query(Student).options(selectinload(Student.attendances)).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return ok(student)


@student_router.post("/", response_model=SuccessResponse[StudentResponse], status_code=201)
def create_student(
    data: StudentCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.STUDENT_WRITE)),
):
    student = Student(**data.model_dump())
    db.add(student)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Student ID or user ID already in use")
    db.refresh(student)
    return ok(student)


@student_router.put("/{student_id}", response_model=SuccessResponse[StudentResponse])
def update_student(
    student_id: int,
    data: StudentUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.STUDENT_WRITE)),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.version != data.version:
        raise HTTPException(
            status_code=409, detail="Resource was modified by another request. Reload and retry.")
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(student, key, value)
    db.commit()
    db.refresh(student)
    return ok(student)


@student_router.delete("/{student_id}", status_code=204)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.STUDENT_WRITE)),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()


# ---------------------------------------------------------------------------
# Teachers
# ---------------------------------------------------------------------------
teacher_router = APIRouter(prefix="/teachers", tags=["Teachers"])


@teacher_router.get("/", response_model=SuccessResponse[list[TeacherResponse]])
def list_teachers(
    department_id: int | None = None,
    employee_id: str | None = Query(
        None, description="Partial match on employee_id"),
    specialization: str | None = Query(
        None, description="Partial match on specialization"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Teacher)
    if department_id:
        query = query.filter(Teacher.department_id == department_id)
    if employee_id:
        query = query.filter(Teacher.employee_id.ilike(f"%{employee_id}%"))
    if specialization:
        query = query.filter(
            Teacher.specialization.ilike(f"%{specialization}%"))
    query = apply_sort(query, Teacher, sort_by, sort_order)
    return paginate(query, page, page_size)


@teacher_router.get("/{teacher_id}", response_model=SuccessResponse[TeacherResponse])
def get_teacher(teacher_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return ok(teacher)


@teacher_router.post("/", response_model=SuccessResponse[TeacherResponse], status_code=201)
def create_teacher(
    data: TeacherCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TEACHER_WRITE)),
):
    teacher = Teacher(**data.model_dump())
    db.add(teacher)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Employee ID or user ID already in use")
    db.refresh(teacher)
    return ok(teacher)


@teacher_router.put("/{teacher_id}", response_model=SuccessResponse[TeacherResponse])
def update_teacher(
    teacher_id: int,
    data: TeacherUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TEACHER_WRITE)),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if teacher.version != data.version:
        raise HTTPException(
            status_code=409, detail="Resource was modified by another request. Reload and retry.")
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(teacher, key, value)
    db.commit()
    db.refresh(teacher)
    return ok(teacher)


@teacher_router.delete("/{teacher_id}", status_code=204)
def delete_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TEACHER_WRITE)),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    db.delete(teacher)
    db.commit()


# ---------------------------------------------------------------------------
# Profile Info
# ---------------------------------------------------------------------------
profile_router = APIRouter(prefix='/profile-info', tags=['Profile Info'])


def _generate_user_profile_response(profile: Profile) -> s.UserProfileResponse:
    response = s.UserProfileResponse(
        profile_id=profile.id,
        version=profile.version,
        personal_information=s.PersonalInformation(
            full_name=profile.full_name,
            date_of_birth=profile.date_of_birth,
            country=profile.country,
            email=profile.email,
            mobile_no=profile.mobile_no,
            ext_no=profile.ext_no,
            photo=profile.photo,
            digital_signature=profile.signature
        ),
        rank=profile.rank,
        command=profile.command,
        qualification=profile.qualification,
        platforms=[p.platform_code for p in profile.platforms],
        fitness=None if not profile.fitness else s.UserFitness(
            status=profile.fitness.status, iso_prep=profile.fitness.iso_prep, limitation=profile.fitness.limitation),
        airf=None if not profile.airf else s.UserAIRF(status=profile.airf.status, items=[s.AIRFItem(
            title=ai.title, published_date=ai.published_date, read_on_date=ai.read_on_date, status=ai.status
        ) for ai in profile.airf.items]),
        experience=s.UserExperience(items=[s.ExperienceItem(
            platform=v.platform, minutes=v.minutes) for v in profile.experiences]),
        teach_courses=[s.TeachCourseItem(id=ci.id, title=getattr(ci, "title", None)) for ci in profile.teach_courses],
        currency=None if not profile.currency else s.UserCurrency(
            blocking_status=profile.currency.blocking_status,
            no_go_status=profile.currency.no_go_status,
            go_status=profile.currency.go_status,
            items=[
                s.CurrencyItem(
                    currency=ci.name,
                    type=ci.type,
                    category=ci.category,
                    period=f'{ci.period} {ci.period_type}',
                    last_performed=ci.last_performed,
                    score=ci.score,
                    next_due=ci.next_due,
                    extended_to=ci.extended_to,
                    days_remaining=ci.days_remaining,
                    status=ci.status
                )
                for ci in profile.currency.items
            ]

        )
    )
    return response


def _do_action_to_profile_mod_request(request_id: int, action: Literal['approve', 'reject', 'cancel'], db: Session, current_user):
    request = db.get(ProfileModificationRequest, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if not current_user.has_role('admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not allowed to process")
    if not request.is_open:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No active request found")

    actions = {
        'approve': request.approve_modification,
        'reject': request.reject_modification,
        'cancel': request.cancel_modification
    }
    if not actions.get(action, None):
        return

    actions[action]()
    db.commit()


@profile_router.post("/mod_request/{request_id}/approve", response_model=ApiResponse)
def approve_profile_mod_request(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _do_action_to_profile_mod_request(request_id, 'approve', db, current_user)
    return ApiResponse(success=True)


@profile_router.post("/mod_request/{request_id}/reject", response_model=ApiResponse)
def reject_profile_mod_request(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _do_action_to_profile_mod_request(request_id, 'reject', db, current_user)
    return ApiResponse(success=True)


@profile_router.post("/mod_request/{request_id}/cancel", response_model=ApiResponse)
def cancel_profile_mod_request(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _do_action_to_profile_mod_request(request_id, 'cancel', db, current_user)
    return ApiResponse(success=True)


@profile_router.put("/", response_model=ApiResponse)
async def update_profile(data: UserProfileUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = db.get(Profile, data.profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    if profile.version != data.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Resource was modified by another request. Reload and retry.")
    if not data.is_modified(profile):
        return ApiResponse(success=True)

    if current_user.has_role('student'):
        # Lazy import: avoids a circular import via the request package at load time.
        from ..request import services as request_services

        description = build_profile_change_description(profile, data)
        mod_request = ProfileModificationRequest.create_modification_request(
            profile,
            full_name=data.full_name,
            date_of_birth=data.date_of_birth,
            country=data.country,
            email=data.email,
            mobile_no=data.mobile_no,
            ext_no=data.ext_no
        )
        db.add(mod_request)
        db.flush()

        admin_id = request_services.first_active_admin_id(db)
        if admin_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No admin available to review the profile change request")

        review_request = await request_services.create_request(
            db,
            current_user,
            purpose="User Profile Change Request",
            description=description,
            recipient_id=None,
            assignee_id=admin_id,
        )
        mod_request.request_id = review_request.id
        db.commit()
        return ApiResponse(success=True)
    else:
        if data.email and data.email != profile.email:
            if db.query(Profile).where(Profile.email == data.email).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already  used")
            profile.email = data.email

        for f in ['full_name', 'date_of_birth', 'country', 'mobile_no', 'ext_no']:
            if getattr(profile, f) != getattr(data, f):
                setattr(profile, f, getattr(data, f))

    db.commit()
    db.refresh(profile)

    return ApiResponse(success=True)


def _sync_with_esnaad_profile(user_id: str, profile: Profile) -> Profile:
    person_info = EsnaadService.get(f'user/v1/details/{user_id}')

    if not person_info:
        return None

    first_name, middle_name, last_name = Profile.split_full_name(
        person_info["FullName"])
    # profile = user.profile
    profile.first_name = first_name
    profile.middle_name = middle_name
    profile.last_name = last_name
    profile.date_of_birth = person_info['DateOfBirth']
    profile.country = person_info['Country']
    profile.email = person_info['Email']
    profile.mobile_no = person_info['MobileNo']
    profile.ext_no = person_info['ExtNo']
    profile.rank = person_info['Rank']
    profile.command = person_info['Command']
    profile.esnaad_sync_time = datetime.now()

    profile.photo = person_info['Photo']

    digital_signature = EsnaadService.get(f'user/v1/signature/{user_id}/')
    if digital_signature and digital_signature['IsActive']:
        profile.signature = digital_signature['Signature']

    crew_info = EsnaadService.get(f'crew/v1/details/{user_id}')
    currency_color_code = {1: 'green', 0: 'red', -1: 'gray'}
    airf_color_code = {'Read': 'green', 'Unread': 'red'}

    if crew_info is not None:
        profile.qualification = crew_info['Qualification']
        profile.fitness = profile.fitness or ProfileFitness()
        profile.fitness.iso_prep = 'Not Submitted' if crew_info[
            'IsoPrepStatus'] is None else crew_info['IsoPrepStatus']
        profile.fitness.status = crew_info['Fit']
        profile.fitness.limitation = None

        profile.airf = profile.airf or ProfileAIRF()
        profile.airf.status = airf_color_code.get(
            crew_info['AirfSummary'], 'green')
        profile.airf.items.clear()
        profile.airf.items.extend([
            ProfileAIRFItem(
                title=item['FileTitle'],
                published_date=item['PublishedDate'],
                read_on_date=item['ReadOn'],
                status=airf_color_code.get(item['Status'], 'gray')
            )
            for item in crew_info['AirfItems']
        ])
        profile.platforms.clear()
        profile.platforms.extend(
            [ProfilePlatform(platform_code=crew_info['PrimaryPlatform'], is_primary=True)] +
            [ProfilePlatform(platform_code=p['Code'], is_primary=False)
                for p in crew_info['CrewPlatforms'] if p['Code'] != crew_info['PrimaryPlatform']]
        )

        profile.experiences.clear()
        profile.experiences.extend([ProfileExperience(
            platform=fe['Label'], minutes=fe['Value']) for fe in crew_info['FlyingExperiences']])

        profile.currency = profile.currency or ProfileCurrency()
        profile.currency.blocking_status = currency_color_code.get(
            crew_info['BlockingStatus'], 'gray')
        profile.currency.no_go_status = currency_color_code.get(
            crew_info['NoGoStatus'], 'gray')
        profile.currency.go_status = currency_color_code.get(
            crew_info['GoStatus'], 'gray')
        profile.currency.items.clear()
        profile.currency.items.extend([
            ProfileCurrencyItem(
                name=ci['Name'],
                type=ci['CurrencyType'],
                category=ci['Category'],
                period=ci['Period'],
                period_type=ci['PeriodType'],
                last_performed=ci['LastPerformed'],
                score=ci['Score'],
                next_due=ci['NextDue'],
                extended_to=ci['ExtendedUntil'],
                days_remaining=ci['DaysRemaining'],
                status=str.lower(ci['StatusColor']) if str.lower(
                    ci['StatusColor']) != 'grey' else 'gray'
            )
            for ci in crew_info['Currencies'] if ci['Name'] == 'MEDCHECK' or ci['Name'] == 'CRM' or ci['Name'] == 'HUET/EBD' or ci['CurrencyType'] == 'ALSE'
        ])

    return profile


@profile_router.get("/{user_id}", response_model=SuccessResponse[s.UserProfileResponse])
def get_profile(user_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.modules.users.models import User
    user = db.execute(select(User).where(
        User.username == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    if not user.is_external and not user.profile.esnaad_sync_time:
        if _sync_with_esnaad_profile(user_id, user.profile):
            db.commit()
            db.refresh(user)
    # else:
    #     profile = user.profile
    profile = user.profile
    return ok(_generate_user_profile_response(profile))


@profile_router.delete("/{profile_id}", response_model=ApiResponse)
def delete_profile(profile_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.has_role('admin'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    
    profile = db.get(Profile,profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    user = profile.user
    db.delete(user)
    db.commit()
    return ApiResponse(success=True)

@router.get("/{military_id}/lookup_user", response_model=SuccessResponse[PersonalInformation], status_code=status.HTTP_201_CREATED)
def lookup_user(military_id: str, _=Depends(require_permission(PermissionCode.USER_WRITE))):
    person_info = EsnaadService.get(f'user/v1/details/{military_id}')
    if not person_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    person_info = PersonalInformation(
        full_name = person_info["FullName"],
        email = person_info['Email'],
        date_of_birth = person_info['DateOfBirth'],
        country = person_info['Country']

    )
    return ok(person_info)
    

# Include sub-routers
router.include_router(student_router)
router.include_router(teacher_router)
router.include_router(profile_router)
