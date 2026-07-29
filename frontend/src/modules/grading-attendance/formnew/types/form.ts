export type FormQuestionType ='text' | 'multiple' | 'rating' | 'true_false' | 'rating_with_text'

export type FormStatus = 'draft' | 'published'

export type FormAssignmentType = 'general' | 'course' | 'user'

export type StudentResponseStatus='not_started' | 'on_going' | 'completed'

export interface CourseOption{
    id:number;
    title:string;
}

export interface FormTaker{
    id:number;
    fullName:string;
    email:string;
    username:string;
}


 

export type QuestionType = 'multiple_choice' | 'essay' | 'true_false'
export type Difficulty = 'easy' | 'medium' | 'difficult'

 export interface FormAnswerOption{
    id:number;
    text:string;
    weight?:number;
}


export interface FormQuestion{
    id:number;
    text:string;
    type:FormQuestionType;
    allowMultiple?:boolean;
    options?:FormAnswerOption[];
    weight:number;
    required?:boolean;
    quizName?:string;
    pool_question_id?: number | null;
    existingQuizId?:number | undefined
}

export interface Form{
    id:number;
    title:string;
    description:string | null | undefined;
    questions:FormQuestion[];
    status:FormStatus
    scheduledAt?:string | null;
    courseId?:number | null;
    assignmentType?:FormAssignmentType;
    assigneeId?:string | null;
}

export interface StudentResponse{
    id:number; // response id
    formId:number|undefined;
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

 

export interface FormPermission {
 
  hasFormManage: boolean
   
  hasFormTake: boolean
 
  hasFormView: boolean
}