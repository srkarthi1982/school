from datetime import datetime
from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field, ConfigDict

from app.core.schemas import TimestampedResponse

SurveyQuestionType=Literal["text","multiple","rating","true_false","rating_with_text"]
SurveyStatus=Literal["draft","published"]
SurveyAssignmentType=Literal["general","course","user"]






# -----------------------------------------------------------------
#  Answer Option schemas
# ------------------------------------------------------------------
#  
# -----------------------------------------------------------------
class SurveyAnswerOptionBase(BaseModel):
    text:str
    weight: Optional[int] = None 

class SurveyAnswerOptionCreate(SurveyAnswerOptionBase):
    id: Optional[int] = None
    question_id: Optional[int] = None

class SurveyAnswerOptionResponse(SurveyAnswerOptionBase):
    id:int
    question_id:int
    model_config = ConfigDict(from_attributes=True)
       

# -----------------------------------------------------------------
#  Pool Answer Option schemas
# ------------------------------------------------------------------
class SurveyPoolAnswerOptionBase(BaseModel):
    text:str
    weight: Optional[int] = None 

class SurveyPoolAnswerOptionCreate(SurveyPoolAnswerOptionBase):
    pass

class SurveyPoolAnswerOptionResponse(SurveyPoolAnswerOptionBase):
    id:int
    model_config = ConfigDict(from_attributes=True)



# -----------------------------------------------------------------
#  Survey Question schemas
# ------------------------------------------------------------------
class SurveyQuestionBase(BaseModel):
    text: str
    type: SurveyQuestionType
    weight: int = 1
    required: bool = False
    allow_multiple: bool = False          # camel‑case matches your TS interface
    

class SurveyQuestionCreate(SurveyQuestionBase):
    pool_question_id: Optional[int]=None
    options: List[SurveyAnswerOptionCreate] = []

class SurveyQuestionResponse(SurveyQuestionBase):
    id:int
    survey_id:int
    pool_question_id: Optional[int]=None
    options: List[SurveyAnswerOptionResponse] = [] #Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------
#  Survey Question Pool schemas
# ------------------------------------------------------------------
class SurveyQuestionPoolBase(BaseModel):
    text: str
    type: SurveyQuestionType
    weight: int = 1
    required: bool = False
    allow_multiple: bool = False          # camel‑case matches your TS interface
    

class SurveyQuestionPoolCreate(SurveyQuestionPoolBase):
    options: List[SurveyPoolAnswerOptionCreate] = [] 

class SurveyQuestionPoolResponse(SurveyQuestionPoolBase):
    id:int
    options: List[SurveyPoolAnswerOptionResponse] = [] #Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

# --------------------------------------------------
# Schemas for Survey
# --------------------------------------------------
class SurveyBase(BaseModel):
    title: str
    description: Optional[str] = None
    status:str = "draft"
    scheduled_at: Optional[datetime] = None
    course_id: Optional[int] = None
    assignment_type: SurveyAssignmentType = "general"
    assignee_id: Optional[str] = None

class SurveyCreate(SurveyBase):
    questions:List[SurveyQuestionCreate] = [] #Field(default_factory=list)

class SurveyUpdate(BaseModel):
    title: Optional[str]=None
    description:Optional[str]=None
    status:Optional[str]=None
    scheduled_at: Optional[datetime] = None
    course_id: Optional[int] = None
    assignment_type: Optional[SurveyAssignmentType] = None
    assignee_id: Optional[str] = None

class SurveyResponse(SurveyBase):
    id:int
    questions:List[SurveyQuestionResponse]=Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# Schemas for Student Responses
# --------------------------------------------------

class StudentResponseBase(BaseModel):
    survey_id:int
    student_id:str
    answers:dict[str,Any]={}
    question_times:Optional[dict[str,Any]]=None
    is_started:bool=False
    is_finished:bool=False
    current_index:Optional[int]=None
    overall_grade:Optional[int]=None

class StudentResponseCreate(StudentResponseBase):
    started_at:Optional[datetime]=None
    completed_at:Optional[datetime]=None

class StudentResponseUpdate(BaseModel):
    answers:Optional[dict[str,Any]]=None
    question_times:Optional[dict[str,Any]]=None
    is_started:Optional[bool]=None
    is_finished:Optional[bool]=None
    current_index:Optional[int]=None
    overall_grade:Optional[float]=None
    completed_at:Optional[datetime]=None

class StudentResponseResponse(StudentResponseBase):
    id:int
    started_at:datetime
    completed_at:Optional[datetime]=None

    model_config=ConfigDict(from_attributes=True)


# --------------------------------------------------
# Schema for survey-eligible users (assignment combo box)
# --------------------------------------------------
class RecipientsResponse(BaseModel):
    """Students a survey is currently sent to, plus those who've already finished it
    (locked — they can't be unsent)."""

    student_ids: list[int] = Field(default_factory=list)
    completed_student_ids: list[int] = Field(default_factory=list)


class RecipientsUpdate(BaseModel):
    student_ids: list[int] = Field(default_factory=list)


class SurveyTakerResponse(BaseModel):
    id:int
    full_name:str
    email:str
    username:str

    model_config=ConfigDict(from_attributes=True)