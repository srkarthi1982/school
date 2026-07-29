from datetime import date

from pydantic import BaseModel, Field


class InstanceCurrencySelectedResponse(BaseModel):
    id: int
    course_instance_id: int
    currency_master_id: int


class SaveInstanceCurrenciesRequest(BaseModel):
    currency_ids: list[int]


class InstanceCurrencyCertCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    currencies_certificate_completion: int


class InstanceCertificateResponse(BaseModel):
    certificateUrl: str | None = None


class SeedResponse(BaseModel):
    """Returned on a successful seed — the populated state."""
    currencies_cert_seeded: bool
    currencies_certificate_completion: int


class InstanceInfoResponse(BaseModel):
    """Instance info with completion — seed happens in this call."""
    course_title: str
    course_master_status: str | None
    currencies_cert_seeded: bool
    currencies_certificate_completion: int
    flight_package_completion: int = 0
    task_association_completion: int = 0
    flight_pack_association_completion: int = 0


# ─── Flight Package (instance) ──────────────────────────────────────────────

class InstanceFlightPackageTaskInput(BaseModel):
    """A flight-package task references a task in the shared catalog by id."""
    task_master_id: int


class InstanceFlightPackageInput(BaseModel):
    name: str = ""
    tasks: list[InstanceFlightPackageTaskInput] = []


class InstanceFlightPackageTaskResponse(BaseModel):
    id: int
    task_master_id: int
    task_no: str
    task_description: str


class InstanceFlightPackageResponse(BaseModel):
    id: int
    name: str
    tasks: list[InstanceFlightPackageTaskResponse] | None = None


class SaveInstanceFlightPackagesRequest(BaseModel):
    packages: list[InstanceFlightPackageInput] = []


class InstanceFlightPackageCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    flight_package_completion: int


# ─── Task Association (instance) ────────────────────────────────────────────

class InstanceTaskAssociationInput(BaseModel):
    """One association record: a task plus its EO and currency selections."""
    task_master_id: int
    enabling_objective_ids: list[int] = []
    currency_master_ids: list[int] = []


class SaveInstanceTaskAssociationsRequest(BaseModel):
    associations: list[InstanceTaskAssociationInput] = []


class InstanceTaskAssociationEOResponse(BaseModel):
    enabling_objective_id: int
    label: str


class InstanceTaskAssociationCurrencyResponse(BaseModel):
    currency_master_id: int
    name: str


class InstanceTaskAssociationResponse(BaseModel):
    id: int
    task_master_id: int
    task_no: str
    task_description: str
    enabling_objectives: list[InstanceTaskAssociationEOResponse] = []
    currencies: list[InstanceTaskAssociationCurrencyResponse] = []


class InstanceAvailableTaskResponse(BaseModel):
    """A flight task usable for association — drawn from this instance's packages."""
    task_master_id: int
    task_no: str
    task_description: str


class InstanceEnablingObjectiveOptionResponse(BaseModel):
    id: int
    label: str


class InstanceTaskAssociationCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    task_association_completion: int


# ─── Flight Pack Association (instance) ──────────────────────────────────────

class InstanceFlightPackTaskResponse(BaseModel):
    """A flight package selectable for association."""
    package_id: int
    package_name: str


class InstanceLessonOptionResponse(BaseModel):
    """A lesson from lesson_selection, selectable for association."""
    id: int
    lesson_title: str


class InstanceFlightPackAssociationLessonResponse(BaseModel):
    """A lesson linked to a flight-pack association."""
    lesson_id: int
    lesson_title: str


class InstanceFlightPackAssociationInput(BaseModel):
    """One association record: a flight package plus its lesson selections."""
    package_id: int
    lesson_ids: list[int] = []


class SaveInstanceFlightPackAssociationsRequest(BaseModel):
    associations: list[InstanceFlightPackAssociationInput] = []


class InstanceFlightPackAssociationResponse(BaseModel):
    id: int
    package_id: int
    package_name: str
    lessons: list[InstanceFlightPackAssociationLessonResponse] = []


class InstanceFlightPackAssociationCompletionResponse(BaseModel):
    tab: str
    tab_status: str
    flight_pack_association_completion: int
