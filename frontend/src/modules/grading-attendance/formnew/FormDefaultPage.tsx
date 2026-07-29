import { HiOutlinePlus, HiOutlineClipboardDocumentList, HiOutlineEye, HiOutlinePencilSquare, HiOutlinePlay } from "react-icons/hi2"
import { useI18n } from "../../../infra/locales/I18nContext"
import SectionHeader from "../../../infra/shared/components/SectionHeader"
import EmptyState from "../../../infra/shared/components/EmptyState"
import { PermissionCode } from "../../../infra/shared/types/permissions"
import useAuthStore, { selectUserPermissions } from "../../../infra/auth/useAuthStore"
import { useFormStore } from "./stores/formStore"
import { STATUS_COLORS, STUDENT_RESPONSE_STATUS_COLORS, TYPE_COLORS, ViewRole } from "./constants"
import { StudentResponseStatus, Form, FormQuestion, FormQuestionType, FormStatus } from "./types/form"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { readLessonCtx, type LessonCtx } from "../../dashboard-scheduling/schedule-management/lesson-detail/lessonCompletion"
import Paginator from "../../../infra/shared/components/Paginator"
import { useShallow } from "zustand/react/shallow"
import { FormFormModal } from "./components/form-form-modal"
import { SelectedFormPanel } from "./ui/selected-form-panel"
import { QuestionFormModal } from "./ui/question-form-modal"
 
import { useStudentStore } from "./stores/studentStore"
import { confirmDialog } from "../../../infra/shared/store/useConfirmStore"
import SendToStudentsModal from "../../../infra/shared/components/SendToStudentsModal"




const PAGE_SIZE = 6
const labelByStudentResponseStatus: Record<StudentResponseStatus, string> = {
  on_going: 'on going',//t('form.studentResponse.form_pending'),
  not_started: 'not started',// t('form.studentResponse.form_attended'),
  completed: 'completed'
}

export default function FormDefaultPage() {
  const { t } = useI18n()
  const permissions = useAuthStore(selectUserPermissions) as unknown as Set<PermissionCode>
  const [viewRole, setViewRole] = useState<ViewRole>(() => 'teacher')

  const {
    forms,
    updatePermission,
    formPermissions,
    attempts,
    selectedFormId,
    loading,
    loaded,
    selectForm,
    addForm,
    updateForm,
    removeForm,
    addQuestion,
    updateQuestion,
    removeQuestion,
    questionsFromQuizPool,
    listForms,
    listAssignedForms,
    fetchFormPool,
    formPoolQuestions,
    createQuestionPoolItem,
    fetchEligibleTakers,
    eligibleTakers,
    getRecipients,
    setRecipients

  } =
    useFormStore(
      useShallow((s) => ({
        forms: s.forms,
        updatePermission: s.updatePermission,
        formPermissions: s.formPermissions,
        selectedFormId: s.selectedFormId,
        loading: s.loading,
        loaded: s.loaded,
        selectForm: s.selectForm,
        attempts: s.attempts,
        addForm: s.addForm,
        updateForm: s.updateForm,
        removeForm: s.removeForm,
        addQuestion: s.addQuestion,
        updateQuestion: s.updateQuestion,
        removeQuestion: s.removeQuestion,
        questionsFromQuizPool: s.questionsFromQuizPool,
        listForms: s.listForms,
        listAssignedForms: s.listAssignedForms,
        fetchFormPool: s.fetchFormPool,
        formPoolQuestions: s.formPoolQuestions,
        createQuestionPoolItem: s.createQuestionPoolItem,
        fetchEligibleTakers: s.fetchEligibleTakers,
        eligibleTakers: s.eligibleTakers,
        getRecipients: s.getRecipients,
        setRecipients: s.setRecipients
      }))
    );

  const { hasFormManage, hasFormTake, hasFormView } = formPermissions

  const [refreshFormPoolQns, setRefreshFormPoolQns] = useState(false);

  const [isFormFinished, setIsFormFinished] = useState(false);
  // const [formResponseStatus,setFormResponseStatus]=useState<StudentResponseStatus>();

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

  const handleOnCloseSelectedFormPanel = () => {
    // A student's list only holds forms they haven't finished — refresh on close
    // so a just-submitted form drops off without a manual reload.
    if (permissions.has('form:take') && !permissions.has('form:creator')) {
      void listAssignedForms()
    }
  }

  useEffect(() => {
    // if (hasFormTake)
    listResponses();
  }, [listResponses, hasFormTake])

  // <span
  //                             className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
  //                             style={{ background: sc.bg, color: sc.text }}
  //                           >
  //                             {getFormResponseStatus(s.id)}
  //                           </span>

  const getResponseStatusAndColor = (formId: number, lengthOfQns?: number) => {
    const resp = responses.find(res => res.formId === formId && res.studentId === studentId)

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
  const getFormResponseStatus = (formId: number, lengthOfQns?: number) => {

    const result: { responseStatus: string, srs: { bg: string, text: string }, completedPerc?: string }
      = getResponseStatusAndColor(formId, lengthOfQns);

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
    const selectedFormId = selectForm === null ? 0 : selectForm

    setIsFormFinished(responses.find(res => res.formId === selectedFormId)?.isFinished ?? false)


  })

  useEffect(() => {
    void fetchFormPool()
  }, [fetchFormPool, refreshFormPoolQns, hasFormManage])

  // A pure taker (student) only sees forms sent to them and not yet finished;
  // creators keep the full list.
  const isPureTaker = permissions.has('form:take') && !permissions.has('form:creator')

  useEffect(() => {
    if (isPureTaker) void listAssignedForms()
    else void listForms()
  }, [isPureTaker, listForms, listAssignedForms])

  // When arriving from a "Take" deep-link (e.g. the lesson-detail screen), select
  // the target form AND flag it so the panel auto-opens its take modal.
  const navigate = useNavigate()
  const [deepLinked, setDeepLinked] = useState(false)
  const [autoStartFormId, setAutoStartFormId] = useState<number | null>(null)
  // Captured before the URL is cleaned below, so it survives for completion
  // marking and the "return to lesson detail" navigation on submit.
  const [lessonCtx, setLessonCtx] = useState<LessonCtx | null>(null)
  useEffect(() => {
    if (deepLinked || !loaded) return
    const take = new URLSearchParams(window.location.search).get('take')
    if (!take) return
    const formId = Number(take)
    const target = forms.find((f) => f.id === formId)
    if (target) {
      selectForm(formId)
      setAutoStartFormId(formId)
      setLessonCtx(readLessonCtx(window.location.search))
      setDeepLinked(true)
      const url = new URL(window.location.href.replace(window.location.search, ''))
      url.searchParams.delete('take')
      url.searchParams.delete('lessonCtx')
      window.history.replaceState({}, '', url.toString())
    }
  }, [loaded, deepLinked, forms, selectForm])

  

 
  // The server already filters a taker's list down to forms sent to them that
  // aren't finished (via listAssignedForms), and creators get the full list, so
  // no additional client-side filtering is needed here.
  const publishedForms = forms


  const [selectedFormIdInternal, setSelectedFormIdInternal] = useState(selectedFormId)

  const selectedForm = useMemo(
    () => 
      publishedForms.find((q) => q.id === selectedFormId || q.id === selectedFormIdInternal) ?? 
      // publishedForms.find((q)=>q.id === selectedFormIdInternal) ??
       null
    , [publishedForms, selectedFormId,selectedFormIdInternal]
    
  )




  // const existingQuestionsForBrowse:ExistingQuestionEntry[]=[];
  // const existingQuestionsForBrowse = useMemo<ExistingQuestionEntry[]>(() => {
  //     if (!selectedForm) return []
  //     const currentDescriptions = new Set(
  //       selectedForm.questions.map((qq) => qq.text.trim().toLowerCase()),
  //     )
  //     return forms.flatMap((qz) =>
  //       qz.id === selectedForm.id || qz.status != 'published'
  //         ? []
  //         : qz.questions
  //             .filter((qq) => !currentDescriptions.has(qq.text.trim().toLowerCase()))
  //             .map((qq) => ({ question: qq, formId: qz.id, formName:qz.title })),
  //     )
  //   }, [forms, selectedForm])

  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(publishedForms.length / PAGE_SIZE))

  const publishedFormsSliced = useMemo(
    () =>
      publishedForms.sort((a,b)=>b.id - a.id).slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
      ),
    [publishedForms, page],
  )

 
   

  const rangeStart = publishedForms.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(publishedForms.length, page * PAGE_SIZE)

  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [formModalMode, setFormModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null)
  const [questionModalMode, setQuestionModalMode] = useState<'create' | 'edit' | null>(null)
  const [takingForm, setTakingForm] = useState<Form | null>(null)
  // "Send to students" modal state.
  const [sendForm, setSendForm] = useState<Form | null>(null)
  const [sendRecipients, setSendRecipients] = useState<{ studentIds: number[]; completedStudentIds: number[] } | null>(null)

  const openSend = async (form: Form) => {
    setSendForm(form)
    setSendRecipients(null)
    void fetchEligibleTakers()
    try {
      setSendRecipients(await getRecipients(form.id))
    } catch {
      setSendRecipients({ studentIds: [], completedStudentIds: [] })
    }
  }
  // const labelByFormType: Record<FormQuestionType, string> = {
  //     multiple: t('form.types.multiple'),
  //     text: t('form.types.text'),
  //     rating: t('form.types.rating'),

  //   }
  const labelByQuestionType: Record<FormQuestionType, string> = {
    multiple: t('form.types.multiple'),
    text: t('form.types.text'),
    rating: t('form.types.rating'),
    rating_with_text: t('form.types.ratingWithText'),
    true_false: t('form.types.trueFalse'),
  }
  const labelByStatus: Record<FormStatus, string> = {
    draft: t('form.status.draft'),
    published: t('form.status.published'),
  }





  const openCreateForm = () => {
    setEditingForm(null)
    setFormModalMode('create')
  }
  const openEditForm = (q: Form) => {
    setEditingForm(q)
    setFormModalMode('edit')
  }
  const closeFormModal = () => {
    setFormModalMode(null)
    setEditingForm(null)
  }

  const openCreateQuestion = () => {
    setEditingQuestion(null)
    setQuestionModalMode('create')
  }
  const openEditQuestion = (qq: FormQuestion) => {
    setEditingQuestion(qq)
    setQuestionModalMode('edit')
  }
  const closeQuestionModal = () => {
    setQuestionModalMode(null)
    setEditingQuestion(null)
    // setRefreshFormPoolQns(false)
  }

  useEffect(() => {
    updatePermission({
      hasFormManage: permissions.has('form:creator'),
      hasFormTake: permissions.has('form:take'),
      hasFormView: permissions.has('form:view')
    })
    updatePermissionStudent({
      hasFormManage: permissions.has('form:creator'),
      hasFormTake: permissions.has('form:take'),
      hasFormView: permissions.has('form:view')
    })
  }, [permissions])


  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [viewRole])



  const handleSelectForm = (formId: number) => {
    selectForm(formId)
    console.log('selectedFormIdInternal',formId)
    setSelectedFormIdInternal(formId)
     
  }

  return (
    <div className="flex flex-col gap-5 h-full min-h-0 overflow-hidden">
      <SectionHeader
        icon={<HiOutlineClipboardDocumentList />}
        eyebrow={t('common.management')}
        title={t('form.title')}
        description={t('form.intro')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr] gap-4 min-h-0 flex-1">
        <section className="card flex flex-col min-h-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-bd flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase">
                {t('form.forms')}
              </p>
              <p className="text-[12.5px] text-secondary mt-0.5">
                {publishedForms.length === 0
                  ? `0 ${t('form.totalForms')}`
                  : `${rangeStart}–${rangeEnd} ${t('form.of')} ${publishedForms.length}`}
              </p>
            </div>
            {formPermissions?.hasFormManage && (
              <button
                className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
                data-guide="form:create"
                //enable add quiz
                onClick={openCreateForm}
              >
                <HiOutlinePlus className="text-[14px]" />
                {t('form.createForm')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto thin-scrollbar-light">
            {publishedForms.length === 0 ? (
              <EmptyState
                bare
                icon={<HiOutlineClipboardDocumentList />}
                title={t('form.noForms')}
                description={t('empty.form.noFormsDesc')}
              />

            ) : (
              <ul className="flex flex-col">
                {publishedFormsSliced.map((s) => {
                  const isActive = s.id === selectedFormId
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
                        onClick={()=> handleSelectForm(s.id)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h3 className="text-[14px] font-bold text-primary leading-snug">
                            {s.title}
                          </h3>

                          {hasFormManage && <span
                            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
                            style={{ background: sc.bg, color: sc.text }}
                          >
                            {labelByStatus[s.status]}
                          </span>}
                          {hasFormTake &&
                            getFormResponseStatus(s.id, s.questions.length)
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
                            {s.questions.length} {t('form.questions')}

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

         
          {!selectedForm ? (
            <div className="flex-1 flex flex-col min-h-0">
              <EmptyState
                fill
                bare
                icon={<HiOutlineClipboardDocumentList />}
                title={t('form.selectForm')}
                description={t('empty.form.selectDesc')}
                hints={[
                  { icon: <HiOutlineEye />, title: t('empty.form.previewTitle'), description: t('empty.form.previewDesc') },
                  { icon: <HiOutlinePencilSquare />, title: t('empty.form.editTitle'), description: t('empty.form.editDesc') },
                  { icon: <HiOutlinePlay />, title: t('empty.form.takeTitle'), description: t('empty.form.takeDesc') },
                ]}
              />
            </div>
          ) : (
            <SelectedFormPanel
              form={selectedForm}
              autoStart={autoStartFormId === selectedForm.id}
              lessonCtx={autoStartFormId === selectedForm.id ? lessonCtx : null}
              onReturnToLesson={() => navigate(-1)}
              onCloseSelectedFormPanel={handleOnCloseSelectedFormPanel}
              //   labelByFormType={labelByFormType}
              labelByQuestionType={labelByQuestionType}
              labelByStatus={labelByStatus}

              pastAttempts={attempts.filter((a) => a.formId === selectedForm.id)}
              // showStatus={canShowQuizStatus}
              onAddQuestion={openCreateQuestion}
              onEditQuestion={openEditQuestion}
              onEditForm={() => openEditForm(selectedForm)}
              onDeleteForm={async () => {
                if (await confirmDialog({ title: t('form.confirmDeleteForm'), confirmLabel: 'Delete', tone: 'danger' }))
                  void removeForm(selectedForm.id)
              }}
              onDeleteQuestion={async (qid) => {
                if (await confirmDialog({ title: t('form.confirmDeleteQuestion'), confirmLabel: 'Delete', tone: 'danger' }))
                  void removeQuestion(selectedForm.id, qid)
              }}

              onTake={() => setTakingForm(selectedForm)}
              onSend={() => void openSend(selectedForm)}
              showStatus={false} onApprove={function (): void {
                throw new Error("Function not implemented.")
              }} onReject={function (): void {
                throw new Error("Function not implemented.")
              }} />
          )}
        </section>
      </div>

      {questionModalMode && selectedForm && (
        <QuestionFormModal
          mode={questionModalMode}
          initial={editingQuestion}
          onClose={closeQuestionModal}
          onSubmit={async (payload, isSavedToFormPool) => {
            if (questionModalMode === 'edit' && editingQuestion)
              await updateQuestion(selectedForm.id, editingQuestion.id, payload)
            else await addQuestion(selectedForm.id, payload)

            if (isSavedToFormPool) {
              // Save the question to form pool
              createQuestionPoolItem(payload as FormQuestion)
              setRefreshFormPoolQns(true)
            }
            closeQuestionModal()
          }}
          labelByQuestionType={labelByQuestionType}
          existingQuestions={questionsFromQuizPool}
          formPoolQuestions={formPoolQuestions.sort((a, b) => b.id - a.id)}
        />
      )}


      {formModalMode && (
        <FormFormModal
          mode={formModalMode}
          initial={editingForm}
          onClose={closeFormModal}
          onSubmit={async (payload) => {

            if (formModalMode === 'edit' && editingForm)
              await updateForm(editingForm.id, payload)
            else await addForm(payload)
            closeFormModal()
          }}
        // labelByQuizType={labelByQuizType}
        />
      )}

      {sendForm && sendRecipients && (
        <SendToStudentsModal
          kindLabel="form"
          itemTitle={sendForm.title}
          roster={eligibleTakers}
          initialSelectedIds={sendRecipients.studentIds}
          lockedIds={sendRecipients.completedStudentIds}
          onClose={() => {
            setSendForm(null)
            setSendRecipients(null)
          }}
          onSave={async (ids) => {
            await setRecipients(sendForm.id, ids)
          }}
        />
      )}


    </div>
  )
}