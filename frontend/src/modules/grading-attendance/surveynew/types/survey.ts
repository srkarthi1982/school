export type SurveyQuestionType ='text' | 'multiple' | 'rating' | 'rating_with_text' | 'true_false'

export type SurveyStatus = 'draft' | 'published'

export type SurveyAssignmentType = 'general' | 'course' | 'user'

export type StudentResponseStatus='not_started' | 'on_going' | 'completed'

export interface CourseOption{
    id:number;
    title:string;
}

export interface SurveyTaker{
    id:number;
    fullName:string;
    email:string;
    username:string;
}


 

export type QuestionType = 'multiple_choice' | 'essay' | 'true_false'
export type Difficulty = 'easy' | 'medium' | 'difficult'

 export interface SurveyAnswerOption{
    id:number;
    text:string;
    weight?:number;
}


export interface SurveyQuestion{
    id:number;
    text:string;
    type:SurveyQuestionType;
    allowMultiple?:boolean;
    options?:SurveyAnswerOption[];
    weight:number;
    required?:boolean;
    quizName?:string;
    pool_question_id?: number | null;
    existingQuizId?:number | undefined
}

export interface Survey{
    id:number;
    title:string;
    description:string | null | undefined;
    questions:SurveyQuestion[];
    status:SurveyStatus
    scheduledAt?:string | null;
    courseId?:number | null;
    assignmentType?:SurveyAssignmentType;
    assigneeId?:string | null;
}

export interface StudentResponse{
    id:number; // response id
    surveyId:number|undefined;
    studentId:string;
    answers:Record<string,any>;
    questionTimes?:Record<string,number>;
    startedAt:string;
    completedAt?:string;
    isStarted:boolean;
    isFinished:boolean;
    currentIndex?:number;
    overallGrade?:number;
}

 

export interface SurveyPermission {
 
  hasSurveyManage: boolean
   
  hasSurveyTake: boolean
 
  hasSurveyView: boolean
}