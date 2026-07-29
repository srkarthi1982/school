import { HiOutlinePlus, HiOutlineClipboardDocumentCheck, HiOutlineEye, HiOutlinePencilSquare, HiOutlinePlay } from "react-icons/hi2"
import { useI18n } from "../../../infra/locales/I18nContext"
import SectionHeader from "../../../infra/shared/components/SectionHeader"
import EmptyState from "../../../infra/shared/components/EmptyState"
import { PermissionCode } from "../../../infra/shared/types/permissions"
import useAuthStore, { selectUserPermissions } from "../../../infra/auth/useAuthStore"
import { useSurveyStore } from "./stores/surveyStore"
import { STATUS_COLORS, STUDENT_RESPONSE_STATUS_COLORS, TYPE_COLORS, ViewRole } from "./constants"
import { StudentResponseStatus, Survey, SurveyQuestion, SurveyQuestionType, SurveyStatus } from "./types/survey"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { readLessonCtx, type LessonCtx } from "../../dashboard-scheduling/schedule-management/lesson-detail/lessonCompletion"
import Paginator from "../../../infra/shared/components/Paginator"
import { useShallow } from "zustand/react/shallow"
import { SurveyFormModal } from "./components/survey-form-modal"
import { SelectedSurveyPanel } from "./ui/selected-survey-panel"
import { QuestionFormModal } from "./ui/question-form-modal"
 
import { useStudentStore } from "./stores/studentStore"
import { confirmDialog } from "../../../infra/shared/store/useConfirmStore"
import SendToStudentsModal from "../../../infra/shared/components/SendToStudentsModal"




const PAGE_SIZE = 6
const labelByStudentResponseStatus: Record<StudentResponseStatus, string> = {
  on_going: 'on going',//t('survey.studentResponse.survey_pending'),
  not_started: 'not started',// t('survey.studentResponse.survey_attended'),
  completed: 'completed'
}

export default function SurveyDefaultPage() {
  const { t } = useI18n()
  const permissions = useAuthStore(selectUserPermissions) as unknown as Set<PermissionCode>
  const [viewRole, setViewRole] = useState<ViewRole>(() => 'teacher')

  const {
    surveys,
    updatePermission,
    surveyPermissions,
    attempts,
    selectedSurveyId,
    loading,
    loaded,
    selectSurvey,
    addSurvey,
    updateSurvey,
    removeSurvey,
    addQuestion,
    updateQuestion,
    removeQuestion,
    questionsFromQuizPool,
    listSurveys,
    listAssignedSurveys,
    fetchSurveyPool,
    surveyPoolQuestions,
    createQuestionPoolItem,
    fetchEligibleTakers,
    eligibleTakers,
    getRecipients,
    setRecipients

  } =
    useSurveyStore(
      useShallow((s) => ({
        surveys: s.surveys,
        updatePermission: s.updatePermission,
        surveyPermissions: s.surveyPermissions,
        selectedSurveyId: s.selectedSurveyId,
        loading: s.loading,
        loaded: s.loaded,
        selectSurvey: s.selectSurvey,
        attempts: s.attempts,
        addSurvey: s.addSurvey,
        updateSurvey: s.updateSurvey,
        removeSurvey: s.removeSurvey,
        addQuestion: s.addQuestion,
        updateQuestion: s.updateQuestion,
        removeQuestion: s.removeQuestion,
        questionsFromQuizPool: s.questionsFromQuizPool,
        listSurveys: s.listSurveys,
        listAssignedSurveys: s.listAssignedSurveys,
        fetchSurveyPool: s.fetchSurveyPool,
        surveyPoolQuestions: s.surveyPoolQuestions,
        createQuestionPoolItem: s.createQuestionPoolItem,
        fetchEligibleTakers: s.fetchEligibleTakers,
        eligibleTakers: s.eligibleTakers,
        getRecipients: s.getRecipients,
        setRecipients: s.setRecipients
      }))
    );

  const { hasSurveyManage, hasSurveyTake, hasSurveyView } = surveyPermissions

  const [refreshSurveyPoolQns, setRefreshSurveyPoolQns] = useState(false);

  const [isSurveyFinished, setIsSurveyFinished] = useState(false);
  // const [surveyResponseStatus,setSurveyResponseStatus]=useState<StudentResponseStatus>();

  const { responses, listResponses, updatePermissionStudent } = useStudentStore(
    useShallow((s) => ({
      responses: s.responses,
      listResponses: s.listResponses,
      updatePermissionStudent: s.updatePermissionStudent
    }))
  )

  const authState = useAuthStore()
  let studentId = ''
  if (authState && authState.user) {
    studentId = authState.user.id.toString()
  }

  const handleOnCloseSelectedSurveyPanel = () => {
    // A student's list only holds surveys they haven't finished — refresh on close
    // so a just-submitted survey drops off without a manual reload.
    if (permissions.has('survey:take') && !permissions.has('survey:creator')) {
      void listAssignedSurveys()
    }
  }

  useEffect(() => {
    // if (hasSurveyTake)
    listResponses();
  }, [listResponses, hasSurveyTake])

  // <span
  //                             className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
  //                             style={{ background: sc.bg, color: sc.text }}
  //                           >
  //                             {getSurveyResponseStatus(s.id)}
  //                           </span>

  const getResponseStatusAndColor = (surveyId: number, lengthOfQns?: number) => {
    const resp = responses.find(res => res.surveyId === surveyId && res.studentId === studentId)

    if (!resp) {
      return {
        responseStatus: labelByStudentResponseStatus['not_started'],
        srs: STUDENT_RESPONSE_STATUS_COLORS['not_started']
      }
    }

    if (resp?.isFinished) {
      return {
        responseStatus: labelByStudentResponseStatus['completed'],
        srs: STUDENT_RESPONSE_STATUS_COLORS['completed']
      }
    }
    if (resp?.isStarted && !resp.isFinished) {

      let compltdPec: number;
      if (resp.currentIndex != undefined && lengthOfQns) {
        compltdPec = Math.round(((resp.currentIndex + 1) / lengthOfQns) * 100)

        return {
          responseStatus: labelByStudentResponseStatus['on_going'],
          srs: STUDENT_RESPONSE_STATUS_COLORS['on_going'],
          completedPerc: compltdPec.toString() + '%'
        }

      }
      else {


        return {
          responseStatus: labelByStudentResponseStatus['on_going'],
          srs: STUDENT_RESPONSE_STATUS_COLORS['on_going'],

        }
      }
    }

    return {
      responseStatus: labelByStudentResponseStatus['not_started'],
      srs: STUDENT_RESPONSE_STATUS_COLORS['not_started']
    }

  }

  //  {Math.round(((currentIndex + 1) / totalQuestions) * 100)}% Complete
  const getSurveyResponseStatus = (surveyId: number, lengthOfQns?: number) => {

    const result: { responseStatus: string, srs: { bg: string, text: string }, completedPerc?: string }
      = getResponseStatusAndColor(surveyId, lengthOfQns);

    return (
      <div>

        {result.completedPerc &&
          <>
            <span
              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
              style={{ background: result.srs.bg, color: result.srs.text }}
            >


              {result.completedPerc ? result.completedPerc : ''}


            </span>
            <br />
          </>
        }

        <span
          className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
          style={{ background: result.srs.bg, color: result.srs.text }}
        >
          {result.responseStatus}

        </span>
      </div>
    )
  }


  useEffect(() => {
    const selectedSurveyId = selectSurvey === null ? 0 : selectSurvey

    setIsSurveyFinished(responses.find(res => res.surveyId === selectedSurveyId)?.isFinished ?? false)


  })

  useEffect(() => {
    void fetchSurveyPool()
  }, [fetchSurveyPool, refreshSurveyPoolQns, hasSurveyManage])

  // A pure taker (student) only sees surveys sent to them and not yet finished;
  // creators keep the full list.
  const isPureTaker = permissions.has('survey:take') && !permissions.has('survey:creator')

  useEffect(() => {
    if (isPureTaker) void listAssignedSurveys()
    else void listSurveys()
  }, [isPureTaker, listSurveys, listAssignedSurveys])

  // When arriving from a "Take" deep-link (e.g. the lesson-detail screen), select
  // the target survey AND flag it so the panel auto-opens its take modal.
  const navigate = useNavigate()
  const [deepLinked, setDeepLinked] = useState(false)
  const [autoStartSurveyId, setAutoStartSurveyId] = useState<number | null>(null)
  // Captured before the URL is cleaned below, for completion marking and the
  // "return to lesson detail" navigation on submit.
  const [lessonCtx, setLessonCtx] = useState<LessonCtx | null>(null)
  useEffect(() => {
    if (deepLinked) return
    if (!loaded) return
    const take = new URLSearchParams(window.location.search).get('take')
    if (!take) return
    const surveyId = Number(take)
    const target = surveys.find((s) => s.id === surveyId)
    if (target) {
      selectSurvey(surveyId)
      setAutoStartSurveyId(surveyId)
      setLessonCtx(readLessonCtx(window.location.search))
      setDeepLinked(true)
      const url = new URL(window.location.href.replace(window.location.search, ''))
      url.searchParams.delete('take')
      url.searchParams.delete('lessonCtx')
      window.history.replaceState({}, '', url.toString())
    }
  }, [deepLinked, loaded, surveys, selectSurvey])

  

 
  // The server already filters a taker's list down to surveys sent to them that
  // aren't finished (via listAssignedSurveys), and creators get the full list,
  // so no additional client-side filtering is needed here.
  const publishedSurveys = surveys


  const [selectedSurveyIdInternal, setSelectedSurveyIdInternal] = useState(selectedSurveyId)

  const selectedSurvey = useMemo(
    () => 
      publishedSurveys.find((q) => q.id === selectedSurveyId || q.id === selectedSurveyIdInternal) ?? 
      // publishedSurveys.find((q)=>q.id === selectedSurveyIdInternal) ??
       null
    , [publishedSurveys, selectedSurveyId,selectedSurveyIdInternal]
    
  )




  // const existingQuestionsForBrowse:ExistingQuestionEntry[]=[];
  // const existingQuestionsForBrowse = useMemo<ExistingQuestionEntry[]>(() => {
  //     if (!selectedSurvey) return []
  //     const currentDescriptions = new Set(
  //       selectedSurvey.questions.map((qq) => qq.text.trim().toLowerCase()),
  //     )
  //     return surveys.flatMap((qz) =>
  //       qz.id === selectedSurvey.id || qz.status != 'published'
  //         ? []
  //         : qz.questions
  //             .filter((qq) => !currentDescriptions.has(qq.text.trim().toLowerCase()))
  //             .map((qq) => ({ question: qq, surveyId: qz.id, surveyName:qz.title })),
  //     )
  //   }, [surveys, selectedSurvey])

  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(publishedSurveys.length / PAGE_SIZE))

  const publishedSurveysSliced = useMemo(
    () =>
      publishedSurveys.sort((a,b)=>b.id - a.id).slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
      ),
    [publishedSurveys, page],
  )

 
   

  const rangeStart = publishedSurveys.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(publishedSurveys.length, page * PAGE_SIZE)

  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null)
  const [surveyModalMode, setSurveyModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<SurveyQuestion | null>(null)
  const [questionModalMode, setQuestionModalMode] = useState<'create' | 'edit' | null>(null)
  const [takingSurvey, setTakingSurvey] = useState<Survey | null>(null)
  // "Send to students" modal state.
  const [sendSurvey, setSendSurvey] = useState<Survey | null>(null)
  const [sendRecipients, setSendRecipients] = useState<{ studentIds: number[]; completedStudentIds: number[] } | null>(null)

  const openSend = async (survey: Survey) => {
    setSendSurvey(survey)
    setSendRecipients(null)
    void fetchEligibleTakers()
    try {
      setSendRecipients(await getRecipients(survey.id))
    } catch {
      setSendRecipients({ studentIds: [], completedStudentIds: [] })
    }
  }
  // const labelBySurveyType: Record<SurveyQuestionType, string> = {
  //     multiple: t('survey.types.multiple'),
  //     text: t('survey.types.text'),
  //     rating: t('survey.types.rating'),

  //   }
  const labelByQuestionType: Record<SurveyQuestionType, string> = {
    multiple: t('survey.types.multiple'),
    text: t('survey.types.text'),
    rating: t('survey.types.rating'),
    true_false: t('survey.types.trueFalse'),
    rating_with_text: t('survey.types.ratingWithText'),
  }
  const labelByStatus: Record<SurveyStatus, string> = {
    draft: t('survey.status.draft'),
    published: t('survey.status.published'),
  }





  const openCreateSurvey = () => {
    setEditingSurvey(null)
    setSurveyModalMode('create')
  }
  const openEditSurvey = (q: Survey) => {
    setEditingSurvey(q)
    setSurveyModalMode('edit')
  }
  const closeSurveyModal = () => {
    setSurveyModalMode(null)
    setEditingSurvey(null)
  }

  const openCreateQuestion = () => {
    setEditingQuestion(null)
    setQuestionModalMode('create')
  }
  const openEditQuestion = (qq: SurveyQuestion) => {
    setEditingQuestion(qq)
    setQuestionModalMode('edit')
  }
  const closeQuestionModal = () => {
    setQuestionModalMode(null)
    setEditingQuestion(null)
    // setRefreshSurveyPoolQns(false)
  }

  useEffect(() => {
    updatePermission({
      hasSurveyManage: permissions.has('survey:creator'),
      hasSurveyTake: permissions.has('survey:take'),
      hasSurveyView: permissions.has('survey:view')
    })
    updatePermissionStudent({
      hasSurveyManage: permissions.has('survey:creator'),
      hasSurveyTake: permissions.has('survey:take'),
      hasSurveyView: permissions.has('survey:view')
    })
  }, [permissions])


  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [viewRole])



  const handleSelectSurvey = (surveyId: number) => {
    selectSurvey(surveyId)
    console.log('selectedSurveyIdInternal',surveyId)
    setSelectedSurveyIdInternal(surveyId)
     
  }

  return (
    <div className="flex flex-col gap-5 h-full min-h-0 overflow-hidden">
      <SectionHeader
        icon={<HiOutlineClipboardDocumentCheck />}
        eyebrow={t('common.management')}
        title={t('survey.title')}
        description={t('survey.intro')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr] gap-4 min-h-0 flex-1">
        <section className="card flex flex-col min-h-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-bd flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase">
                {t('survey.surveys')}
              </p>
              <p className="text-[12.5px] text-secondary mt-0.5">
                {publishedSurveys.length === 0
                  ? `0 ${t('survey.totalSurveys')}`
                  : `${rangeStart}–${rangeEnd} ${t('survey.of')} ${publishedSurveys.length}`}
              </p>
            </div>
            {surveyPermissions?.hasSurveyManage && (
              <button
                className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
                data-guide="survey:create"
                //enable add quiz
                onClick={openCreateSurvey}
              >
                <HiOutlinePlus className="text-[14px]" />
                {t('survey.createSurvey')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto thin-scrollbar-light">
            {publishedSurveys.length === 0 ? (
              <EmptyState
                bare
                icon={<HiOutlineClipboardDocumentCheck />}
                title={t('survey.noSurveys')}
                description={t('empty.survey.noSurveysDesc')}
              />

            ) : (
              <ul className="flex flex-col">
                {publishedSurveysSliced.map((s) => {
                  const isActive = s.id === selectedSurveyId
                  //  const tc = q.type ? TYPE_COLORS[q.type] : defaultTypeColor
                  const sc = STATUS_COLORS[s.status]
                  //  const srs=STUDENT_RESPONSE_STATUS_COLORS[]
                  //  const avgDiff = averageDifficulty(q.questions)
                  //  const dc = avgDiff ? DIFFICULTY_COLORS[avgDiff] : null
                  return (
                    <li key={s.id}>
                      <button
                        className="w-full text-start px-5 py-3.5 border-b border-bd cursor-pointer transition-colors"
                        style={{
                          background: isActive ? 'var(--accent-light)' : 'transparent',
                        }}
                        onClick={()=> handleSelectSurvey(s.id)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h3 className="text-[14px] font-bold text-primary leading-snug">
                            {s.title}
                          </h3>

                          {hasSurveyManage && <span
                            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
                            style={{ background: sc.bg, color: sc.text }}
                          >
                            {labelByStatus[s.status]}
                          </span>}
                          {hasSurveyTake &&
                            getSurveyResponseStatus(s.id, s.questions.length)
                          }

                        </div>
                        <p className="text-[12px] text-secondary line-clamp-2 mb-2">
                          {s.description}
                        </p>
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          {/* <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: tc?.bg, color: tc?.text }}
                            >
                              {q.type ? labelByQuizType[q.type] : ''}
                            </span>
                            {avgDiff && dc && (
                              <span
                                className="px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: dc.bg, color: dc.text }}
                                title={t('quizBank.avgDifficultyHint')}
                              >
                                {labelByDifficulty[avgDiff]}
                              </span>
                            )}
                          </div> */}
                          <span className="text-muted shrink-0">
                            {s.questions.length} {t('survey.questions')}

                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {totalPages > 1 && (
            <div className="border-t border-bd">
              <Paginator page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </section>

        <section className="card flex flex-col min-h-0 overflow-hidden">

         
          {!selectedSurvey ? (
            <div className="flex-1 flex flex-col min-h-0">
              <EmptyState
                fill
                bare
                icon={<HiOutlineClipboardDocumentCheck />}
                title={t('survey.selectSurvey')}
                description={t('empty.survey.selectDesc')}
                hints={[
                  { icon: <HiOutlineEye />, title: t('empty.survey.previewTitle'), description: t('empty.survey.previewDesc') },
                  { icon: <HiOutlinePencilSquare />, title: t('empty.survey.editTitle'), description: t('empty.survey.editDesc') },
                  { icon: <HiOutlinePlay />, title: t('empty.survey.takeTitle'), description: t('empty.survey.takeDesc') },
                ]}
              />
            </div>
          ) : (
            <SelectedSurveyPanel
              survey={selectedSurvey}
              autoStart={autoStartSurveyId === selectedSurvey.id}
              lessonCtx={autoStartSurveyId === selectedSurvey.id ? lessonCtx : null}
              onReturnToLesson={() => navigate(-1)}
              onCloseSelectedSurveyPanel={handleOnCloseSelectedSurveyPanel}
              //   labelBySurveyType={labelBySurveyType}
              labelByQuestionType={labelByQuestionType}
              labelByStatus={labelByStatus}

              pastAttempts={attempts.filter((a) => a.surveyId === selectedSurvey.id)}
              // showStatus={canShowQuizStatus}
              onAddQuestion={openCreateQuestion}
              onEditQuestion={openEditQuestion}
              onEditSurvey={() => openEditSurvey(selectedSurvey)}
              onDeleteSurvey={async () => {
                if (await confirmDialog({ title: t('survey.confirmDeleteSurvey'), confirmLabel: 'Delete', tone: 'danger' }))
                  void removeSurvey(selectedSurvey.id)
              }}
              onDeleteQuestion={async (qid) => {
                if (await confirmDialog({ title: t('survey.confirmDeleteQuestion'), confirmLabel: 'Delete', tone: 'danger' }))
                  void removeQuestion(selectedSurvey.id, qid)
              }}

              onTake={() => setTakingSurvey(selectedSurvey)}
              onSend={() => void openSend(selectedSurvey)}
              showStatus={false} onApprove={function (): void {
                throw new Error("Function not implemented.")
              }} onReject={function (): void {
                throw new Error("Function not implemented.")
              }} />
          )}
        </section>
      </div>

      {questionModalMode && selectedSurvey && (
        <QuestionFormModal
          mode={questionModalMode}
          initial={editingQuestion}
          onClose={closeQuestionModal}
          onSubmit={async (payload, isSavedToSurveyPool) => {
            if (questionModalMode === 'edit' && editingQuestion)
              await updateQuestion(selectedSurvey.id, editingQuestion.id, payload)
            else await addQuestion(selectedSurvey.id, payload)

            if (isSavedToSurveyPool) {
              // Save the question to survey pool
              createQuestionPoolItem(payload as SurveyQuestion)
              setRefreshSurveyPoolQns(true)
            }
            closeQuestionModal()
          }}
          labelByQuestionType={labelByQuestionType}
          existingQuestions={questionsFromQuizPool}
          surveyPoolQuestions={surveyPoolQuestions.sort((a, b) => b.id - a.id)}
        />
      )}


      {surveyModalMode && (
        <SurveyFormModal
          mode={surveyModalMode}
          initial={editingSurvey}
          onClose={closeSurveyModal}
          onSubmit={async (payload) => {

            if (surveyModalMode === 'edit' && editingSurvey)
              await updateSurvey(editingSurvey.id, payload)
            else await addSurvey(payload)
            closeSurveyModal()
          }}
        // labelByQuizType={labelByQuizType}
        />
      )}

      {sendSurvey && sendRecipients && (
        <SendToStudentsModal
          kindLabel="survey"
          itemTitle={sendSurvey.title}
          roster={eligibleTakers}
          initialSelectedIds={sendRecipients.studentIds}
          lockedIds={sendRecipients.completedStudentIds}
          onClose={() => {
            setSendSurvey(null)
            setSendRecipients(null)
          }}
          onSave={async (ids) => {
            await setRecipients(sendSurvey.id, ids)
          }}
        />
      )}


    </div>
  )
}