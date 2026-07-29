from datetime import date
import enum
import uuid

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String, DateTime, LargeBinary
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base, TimestampMixin

from datetime import datetime
import re
from base64 import b64encode, b64decode


class Student(AuditedMixin, Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    # student_id: Mapped[str] = mapped_column(
    #     String(20), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    # program_id: Mapped[int] = mapped_column(ForeignKey("programs.id"))
    # enrollment_date: Mapped[date] = mapped_column(Date)
    # current_semester: Mapped[int] = mapped_column(default=1)

    # Cross-module string references
    user: Mapped["User"] = relationship(
        back_populates="student", foreign_keys=[user_id]
    )
    # program: Mapped["Program"] = relationship(back_populates="students")
    # enrollments: Mapped[list["Enrollment"]] = relationship(
    #     back_populates="student")


class Teacher(AuditedMixin, Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(primary_key=True)
    # employee_id: Mapped[str] = mapped_column(
    #     String(20), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    # department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    # specialization: Mapped[str | None] = mapped_column(
    #     String(255), nullable=True)

    # Cross-module string references
    user: Mapped["User"] = relationship(
        back_populates="teacher", foreign_keys=[user_id]
    )
    # department: Mapped["Department"] = relationship(back_populates="teachers")
    # sections: Mapped[list["Section"]] = relationship(back_populates="teacher")


class ProfileModificationRequestStatus(str,enum.Enum):
    WAIT_FOR_APPROVAL = "WAIT_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"

class ProfileModificationRequest(TimestampMixin, Base):
    __tablename__ = "profile_mod_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))

    full_name: Mapped[str] = mapped_column(String(50))
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=True)
    country: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(50))
    mobile_no: Mapped[str] = mapped_column(String(50), nullable=True)
    ext_no: Mapped[str] = mapped_column(String(20), nullable=True)    
    status: Mapped[ProfileModificationRequestStatus] = mapped_column(String(20), default=ProfileModificationRequestStatus.WAIT_FOR_APPROVAL)
    status_on: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    # Link to the generic Request raised for admin review (request module).
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requests.id", ondelete="SET NULL"), nullable=True)

    profile:Mapped["Profile"] = relationship(foreign_keys=[profile_id])
    
    @property
    def is_open(self):
        return self.status == ProfileModificationRequestStatus.WAIT_FOR_APPROVAL
    
    def _change_mod_status(self, status:ProfileModificationRequestStatus):
        profile_status_map = {
            ProfileModificationRequestStatus.APPROVED:None,
            ProfileModificationRequestStatus.REJECTED:None,
            ProfileModificationRequestStatus.WAIT_FOR_APPROVAL:ProfileModificationRequestStatus.WAIT_FOR_APPROVAL,
        }

        self.status = status
        self.status_on = datetime.now()
        self.profile.profile_mod_status = profile_status_map.get(status,None)
    
    @classmethod
    def create_modification_request(cls,profile:"Profile",full_name:str,date_of_birth:str,country:str,email:str, mobile_no:str,ext_no:str):
        request = ProfileModificationRequest(
            full_name=full_name,
            date_of_birth=date_of_birth,
            country = country,
            email = email,
            mobile_no = mobile_no,
            ext_no = ext_no,
            profile = profile
        )
        request._change_mod_status(ProfileModificationRequestStatus.WAIT_FOR_APPROVAL)
        
        return request

    def approve_modification(self):
        self.profile.full_name = self.full_name
        self.profile.date_of_birth = self.date_of_birth
        self.profile.country = self.country
        self.profile.email = self.email
        self.profile.mobile_no = self.mobile_no
        self.profile.ext_no = self.ext_no

        self._change_mod_status(ProfileModificationRequestStatus.APPROVED) 

    def reject_modification(self):
        self._change_mod_status(ProfileModificationRequestStatus.REJECTED)       

    def cancel_modification(self):
        self._change_mod_status(ProfileModificationRequestStatus.CANCELED)       

class Profile(AuditedMixin, Base):
    __tablename__ = "profiles"
    __audit_exclude__ = frozenset({"_photo", "_signature"})

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    first_name: Mapped[str] = mapped_column(String(50))
    middle_name: Mapped[str] = mapped_column(String(50), nullable=True)
    last_name: Mapped[str] = mapped_column(String(50), nullable=True)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=True)
    country: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(50))
    mobile_no: Mapped[str] = mapped_column(String(50), nullable=True)
    ext_no: Mapped[str] = mapped_column(String(20), nullable=True)
    rank: Mapped[str] = mapped_column(String(100),default="CIVILIAN")
    command: Mapped[str] = mapped_column(String(20), nullable=True)
    qualification: Mapped[str] = mapped_column(String(255), nullable=True)
    _photo: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, deferred=True, name="photo")
    _signature: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, deferred=True, name="signature")
    esnaad_sync_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    profile_mod_status: Mapped[ProfileModificationRequestStatus] = mapped_column(String(20), nullable=True)

    user: Mapped["User"] = relationship(
        back_populates="profile", foreign_keys=[user_id])
    fitness: Mapped["ProfileFitness"] = relationship(
        back_populates="profile", uselist=False, cascade="all, delete-orphan")
    platforms: Mapped[list["ProfilePlatform"]] = relationship(
        back_populates="profile", cascade="all,delete-orphan")
    experiences: Mapped[list["ProfileExperience"]] = relationship(
        back_populates="profile", cascade="all,delete-orphan")
    airf: Mapped["ProfileAIRF"] = relationship(back_populates="profile", uselist=False, cascade="all, delete-orphan")
    currency: Mapped["ProfileCurrency"] = relationship(back_populates="profile", uselist=False,cascade="all, delete-orphan")
    enrollments: Mapped[list["CourseEnrollment"]] = relationship(back_populates="student",passive_deletes=True)
    teach_courses: Mapped[list["CourseInstance"]] = relationship(back_populates="instructors", passive_deletes=True,secondary="course_instructors")

    @property
    def full_name(self) -> str:
        return re.sub(r'\s+', ' ', ' '.join([self.first_name, self.middle_name or '', self.last_name or '']).strip())
    
    @full_name.setter
    def full_name(self, value:str):
        self.first_name, self.middle_name, self.last_name = self.split_full_name(value)
        
    @classmethod
    def split_full_name(cls, full_name: str):
        first_name, mid_name, last_name = None, None, None
        splitted_str = full_name.split()
        if len(splitted_str) > 1:
            first_name, mid_name, last_name = splitted_str[0], ' '.join(
                splitted_str[1:-1]), splitted_str[-1]
        else:
            first_name = full_name

        return first_name, mid_name, last_name

    @property
    def photo(self) -> str:
        return None if self._photo is None else b64encode(self._photo).decode("utf-8")

    @photo.setter
    def photo(self, value: str):
        self._photo = None if not value else b64decode(value)

    @property
    def signature(self) -> str:
        return None if self._signature is None else b64encode(self._signature).decode("utf-8")

    @signature.setter
    def signature(self, value: str):
        self._signature = None if not value else b64decode(value)


class ProfileFitness(TimestampMixin, Base):
    __tablename__ = "profile_fitnesses"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id"), unique=True)
    status: Mapped[str] = mapped_column(String(20))
    iso_prep: Mapped[str] = mapped_column(String(20))
    limitation: Mapped[str] = mapped_column(String(255), nullable=True)

    profile: Mapped["Profile"] = relationship(back_populates="fitness")


class ProfilePlatform(TimestampMixin, Base):
    __tablename__ = "profile_platforms"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    platform_code: Mapped[str] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean)

    profile: Mapped["Profile"] = relationship(back_populates="platforms")


class ProfileAIRF(TimestampMixin, Base):
    __tablename__ = "profile_airf"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    status: Mapped[str] = mapped_column(String(20))

    profile: Mapped["Profile"] = relationship(back_populates="airf")
    items: Mapped[list["ProfileAIRFItem"]
                  ] = relationship(back_populates="airf",cascade="all, delete-orphan")


class ProfileAIRFItem(TimestampMixin, Base):
    __tablename__ = "profile_airf_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    airf_id: Mapped[int] = mapped_column(ForeignKey("profile_airf.id"))
    title: Mapped[str] = mapped_column(String(510))
    published_date: Mapped[date] = mapped_column(Date)
    read_on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)

    airf: Mapped["ProfileAIRF"] = relationship(back_populates="items")


class ProfileExperience(TimestampMixin, Base):
    __tablename__ = "profile_experiences"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    platform: Mapped[str] = mapped_column(String(255))
    minutes: Mapped[int] = mapped_column(Integer)

    profile: Mapped["Profile"] = relationship(back_populates="experiences")


class ProfileCurrency(TimestampMixin, Base):
    __tablename__ = "profile_currencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    blocking_status: Mapped[str] = mapped_column(String(20), nullable=True)
    no_go_status: Mapped[str] = mapped_column(String(20), nullable=True)
    go_status: Mapped[str] = mapped_column(String(20), nullable=True)

    profile: Mapped["Profile"] = relationship(back_populates="currency")
    items: Mapped[list["ProfileCurrencyItem"]
                  ] = relationship(back_populates="profile_currency",cascade="all, delete-orphan")


class ProfileCurrencyItem(TimestampMixin, Base):
    __tablename__ = "profile_currency_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    currency_id: Mapped[int] = mapped_column(
        ForeignKey("profile_currencies.id"))
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(255))
    period: Mapped[int] = mapped_column(Integer)
    period_type: Mapped[str] = mapped_column(String(10))
    last_performed: Mapped[date | None] = mapped_column(Date, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    next_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    extended_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    days_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20))

    profile_currency: Mapped["ProfileCurrency"] = relationship(back_populates="items")
