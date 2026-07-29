export type QuestionType ='text' | 'multiple' | 'rating'


export interface AnswerOption{
    id:string;
    text:string;
    weight?:number;
}

export interface Question{
    id:string;
    text:string;
    type:QuestionType;
    options?:AnswerOption[];
    weight:number;
    required?:boolean;

}

export interface Survey{
    id:string;
    title:string;
    description:string;
    questions:Question[];
    status:'draft' | 'published'
    createdAt:string;
}

export interface StudentResponse{
    id:string; // response id
    surveyId:string;
    studentId:string;
    answers:Record<string,any>;
    startedAt:string;
    completedAt?:string;
    isStarted:boolean;
    isFinished:boolean;
    currentIndex?:number;
}

export interface SurveyPermission {
 
  hasSurveyManage: boolean
   
  hasSurveyTake: boolean
 
}