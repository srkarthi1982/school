import { useEffect, useState } from "react";
import useAuthStore, { selectUserPermissions } from "../../../infra/auth/useAuthStore";
import { PermissionCode } from "../../../infra/shared/types/permissions";
import SurveyTitle from "./components/SurveyTile";
import { useSurveyStore } from "./stores/surveyStore"
import SurveyForm from "./components/SurveyForm";
import { Survey } from "./types/survey";


type ViewRole = 'teacher' | 'student' | 'admin'

export default function SurveyDefaultPage() {

    const permissions = useAuthStore(selectUserPermissions) as unknown as Set<PermissionCode>
     const { surveys,updatePermission,surveyPermissions} = useSurveyStore();

    const [isOpenSurveyForm,setIsOpenSurveyForm]=useState(false)

    const [existingSurvey,setExistingSurvey]=useState<Survey|null>(null);
    // useEffect(() => {
    //     void fetchQuizzes()
    //   }, [fetchQuizzes])





    useEffect(() => {
        updatePermission({
            hasSurveyManage: permissions.has('survey:creator'),
            hasSurveyTake: permissions.has('survey:take')
        })
    }, [permissions])

    const { hasSurveyManage, hasSurveyTake } = surveyPermissions

    const handleOpenSurveyForm=()=>{
        setIsOpenSurveyForm(true)
        setExistingSurvey(null)
    }
    const handleOpenExistingSurveyForm=(existingSurvey:Survey)=>{
        setIsOpenSurveyForm(true);
        setExistingSurvey(existingSurvey)
    }
    return (
        <div>
            {hasSurveyManage &&
                <div className="flex items-center justify-end mb-6">
                    <button className="flex items-center justify-center gap-[7px] py-2.5 rounded-[10px] border-none bg-accent text-white text-[13px] font-bold cursor-pointer tracking-[0.01em] font-sans px-5"
                        onClick={handleOpenSurveyForm}
                    >
                        Create Survey
                    </button>
                </div>
           }
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 items-stretch">

            {surveys?.filter(s=>s.status==='published').map((survey, index) => {
                
                return (
                    <SurveyTitle onEditClick={()=>handleOpenExistingSurveyForm(survey)} survey={survey} key={index} hasSurveyTake={hasSurveyTake} />
                )
            })}
            </div>

            <SurveyForm initialSurvey={existingSurvey?existingSurvey:null} isOpen={isOpenSurveyForm} onClose={()=>setIsOpenSurveyForm(false)}/>
        </div>
    )
}

