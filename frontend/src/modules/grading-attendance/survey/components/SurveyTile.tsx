import { useNavigate } from "react-router-dom"
import { useSurveyStore } from "../stores/surveyStore"
import { Survey, SurveyPermission } from "../types/survey"
import { useState } from "react"
import { HiOutlinePencil, HiOutlinePlayCircle } from "react-icons/hi2"
import useAuthStore from "../../../../infra/auth/useAuthStore"
import SurveyTake from "./SurveyTake"




interface Props {
    survey: Survey

    onEditClick: () => void
    hasSurveyTake: boolean
}
type surveyMode= 'take' | 'review' 
export default function SurveyTitle({ survey, hasSurveyTake, onEditClick }: Props) {

    const[activeSurvey,setActiveSurvey]=useState<string>('')
    const[mode,setMode]=useState<surveyMode>('take')
    const authState = useAuthStore()
    let studentId  = ''
    if(authState && authState.user){
        studentId=authState.user.id.toString()
    }

    const handleStartSurvey =(surveyId:string)=>{
        setActiveSurvey(surveyId)
        setMode('take')
    }

    const handleReviewSurvey=(surveyId:string)=>{
        setActiveSurvey(surveyId)
        setMode('review')
    }
 
      
       
    return (
        <div className="group cursor-pointer rounded-xl border bg-white p-6 shadow-sm hover:shadow-sm transition-all h-full min-h-64 flex flex-col">
            {/* Status Badge */}
            <div className="top-4 right-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${survey.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {survey.status.toUpperCase()}
                </span>
            </div>

            {/* Content - flex-1 pushes footer down */}
            <div className="flex-1">
                <h2 className="font-bold text-xl mb-2">{survey.title}</h2>
                <p className="text-slate-600 mb-4">{survey.description}</p>
            </div>

            {/* Footer - stays at bottom */}
            <div className="flex items-center justify-between mt-auto">
                <span>{survey.questions.length} questions.</span>

                {hasSurveyTake ?
                    <button
                        className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd  transition-colors cursor-pointer font-sans"
                        onClick={()=>handleStartSurvey(survey.id)}
                    >

                        <HiOutlinePlayCircle className="text-[15px]" />
                        {/* {t('quizBank.editQuiz')} */}
                         Start
                    </button>
                    :
                     <button
                        className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd  transition-colors cursor-pointer font-sans"
                        onClick={onEditClick}
                    >
                        <HiOutlinePencil className="text-[14px]" />

                        {/* {t('quizBank.editQuiz')} */}
                         Edit
                    </button>
                    
                }
            </div>

            {/* Survey Take Popup */}
            <SurveyTake isOpen={!!activeSurvey} onClose={()=>setActiveSurvey('')} surveyId={activeSurvey || ''} studentId={studentId} mode={mode} ></SurveyTake>
        </div>
    )
}