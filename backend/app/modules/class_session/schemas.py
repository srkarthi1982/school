from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.schemas import AuditedResponse

SessionStatus = Literal["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]

# G12 — accept "I forgot to schedule and the class started 30 min ago"
# but reject obvious typos / test data from another year.
_PAST_GRACE = timedelta(days=1)


class ClassSessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    scheduled_start: datetime
    scheduled_end: datetime
    # R1 — current school policy is up to 10 participants per virtual
    # classroom. The DB CHECK still allows ≤200 as a sanity bound so we
    # don't have to migrate when the policy changes; Pydantic is the
    # business-rule gate.
    max_participants: int = Field(default=10, ge=1, le=10)
    participant_user_ids: list[int] | None = Field(
        default=None,
        description=(
            "Optional whitelist of user IDs allowed to join this session. "
            "Empty/null = open to anyone with class_session:join. "
            "The host and admin users bypass this list."
        ),
    )

    @field_validator("scheduled_start")
    @classmethod
    def _start_not_in_distant_past(cls, v: datetime) -> datetime:
        # Pydantic returns a naive datetime when the input has no offset;
        # treat that as UTC so the comparison is meaningful.
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v < datetime.now(timezone.utc) - _PAST_GRACE:
            raise ValueError(
                "scheduled_start must be no more than 1 day in the past"
            )
        return v


class ClassSessionUpdate(ClassSessionCreate):
    version: int


class ClassSessionResponse(AuditedResponse):
    id: int
    title: str
    description: str | None
    host_user_id: int
    livekit_room_name: str
    status: SessionStatus
    scheduled_start: datetime
    scheduled_end: datetime
    actual_start: datetime | None
    actual_end: datetime | None
    max_participants: int
    parent_session_id: int | None
    participant_user_ids: list[int] | None

    model_config = {"from_attributes": True}


class JoinTokenResponse(BaseModel):
    token: str
    ws_url: str
    room_name: str
    identity: str
    expires_at: datetime
    is_host: bool


class CreateBreakoutRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    participant_user_ids: list[int] = Field(min_length=1, max_length=200)
    # Optional countdown. NULL/0 = no timer. Capped at 180min so a typo
    # ("3000") can't strand students in a breakout for two days.
    duration_minutes: int | None = Field(default=None, ge=1, le=180)


class BreakoutToken(BaseModel):
    user_id: int
    token: str
    room_name: str
    ws_url: str
    expires_at: datetime


class CreateBreakoutResponse(BaseModel):
    breakout_id: int
    tokens: list[BreakoutToken]
    expires_at: datetime | None = None


class CloseBreakoutResponse(BaseModel):
    tokens: list[BreakoutToken]


class BreakoutInviteeInfo(BaseModel):
    user_id: int
    identity: str
    name: str


class BreakoutSummary(BaseModel):
    breakout_id: int
    name: str
    invitees: list[BreakoutInviteeInfo]
    expires_at: datetime | None = None


class MoveBreakoutRequest(BaseModel):
    user_id: int
    target_breakout_id: int


class MoveBreakoutResponse(BaseModel):
    moved: bool
    source_breakout_id: int
    target_breakout_id: int
    user_id: int


class BreakoutBroadcastRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class BreakoutBroadcastResponse(BaseModel):
    recipients: int
    breakouts: int


RecordingStatus = Literal["STARTING", "ACTIVE", "FINISHED", "FAILED", "ABORTED"]


class ClassSessionRecordingResponse(AuditedResponse):
    id: int
    session_id: int
    egress_id: str
    status: RecordingStatus
    started_at: datetime
    ended_at: datetime | None
    file_path: str | None
    file_size_bytes: int | None
    duration_seconds: int | None
    error_message: str | None

    model_config = {"from_attributes": True}
