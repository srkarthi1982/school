from pydantic import BaseModel


class CurrencyResponse(BaseModel):
    id: int
    name: str


class MasterCourseCurrencyResponse(BaseModel):
    id: int
    course_master_id: int
    currency_master_id: int


class SaveMasterCourseCurrenciesRequest(BaseModel):
    currency_ids: list[int]


class MasterCurrencyCertCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    currencies_certificate_completion: int


class CertificateResponse(BaseModel):
    certificateUrl: str | None = None


# ─── Flight Task Master (shared catalog) ────────────────────────────────────

class FlightTaskMasterResponse(BaseModel):
    id: int
    task_no: str
    task_description: str


class FlightTaskMasterCreate(BaseModel):
    task_no: str
    task_description: str


# ─── Flight Package ─────────────────────────────────────────────────────────

class FlightPackageTaskInput(BaseModel):
    """A flight-package task references a task in the shared catalog by id."""
    task_master_id: int


class FlightPackageInput(BaseModel):
    name: str = ""
    tasks: list[FlightPackageTaskInput] = []


class FlightPackageTaskResponse(BaseModel):
    id: int
    task_master_id: int
    task_no: str
    task_description: str


class FlightPackageResponse(BaseModel):
    id: int
    name: str
    tasks: list[FlightPackageTaskResponse] = []


class SaveFlightPackagesRequest(BaseModel):
    packages: list[FlightPackageInput] = []


class FlightPackageCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    flight_package_completion: int


# ─── Task Association ───────────────────────────────────────────────────────

class TaskAssociationInput(BaseModel):
    """One association record: a task plus its EO and currency selections."""
    task_master_id: int
    enabling_objective_ids: list[int] = []
    currency_master_ids: list[int] = []


class SaveTaskAssociationsRequest(BaseModel):
    associations: list[TaskAssociationInput] = []


class TaskAssociationEOResponse(BaseModel):
    enabling_objective_id: int
    label: str


class TaskAssociationCurrencyResponse(BaseModel):
    currency_master_id: int
    name: str


class TaskAssociationResponse(BaseModel):
    id: int
    task_master_id: int
    task_no: str
    task_description: str
    enabling_objectives: list[TaskAssociationEOResponse] = []
    currencies: list[TaskAssociationCurrencyResponse] = []


class AvailableTaskResponse(BaseModel):
    """A flight task usable for association — drawn from this course's packages."""
    task_master_id: int
    task_no: str
    task_description: str


class EnablingObjectiveOptionResponse(BaseModel):
    id: int
    label: str


class TaskAssociationCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    task_association_completion: int


# ─── Flight Pack Association (master) ───────────────────────────────────────

class LessonOptionResponse(BaseModel):
    id: int
    lesson_title: str


class AvailablePackageResponse(BaseModel):
    package_id: int
    package_name: str


class FlightPackAssociationLessonEntry(BaseModel):
    lesson_id: int


class FlightPackAssociationInput(BaseModel):
    """One FPA record: a package + its lesson selections."""
    package_id: int
    lesson_ids: list[int] = []


class SaveFlightPackAssociationsRequest(BaseModel):
    associations: list[FlightPackAssociationInput] = []


class FlightPackAssociationLessonResponse(BaseModel):
    lesson_id: int
    lesson_title: str


class FlightPackAssociationResponse(BaseModel):
    id: int
    package_id: int
    package_name: str
    lessons: list[FlightPackAssociationLessonResponse] = []


class SaveMasterFpaResponse(BaseModel):
    success: bool
    associations: list[FlightPackAssociationResponse] = []


class FlightPackAssociationCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    flight_pack_association_completion: int
