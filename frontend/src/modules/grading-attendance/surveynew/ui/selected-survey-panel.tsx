import { useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineCheckCircle, HiOutlineEye, HiOutlinePaperAirplane, HiOutlinePencil, HiOutlinePlayCircle, HiOutlinePlus, HiOutlineTrash, HiOutlineXCircle } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
// import type { Quiz, QuizQuestion, QuizType, ValidationStatus, Difficulty, QuizAttempt } from '../store'
import Paginator from '../../../../infra/shared/components/Paginator'


import { useShallow } from 'zustand/react/shallow'
import { StudentResponse, StudentResponseStatus, Survey, SurveyQuestion, SurveyQuestionType, SurveyStatus } from '../types/survey'
import { useSurveyStore } from '../stores/surveyStore'
import SurveyTake from './SurveyTake'
import useAuthStore from '../../../../infra/auth/useAuthStore'
import { useStudentStore } from '../stores/studentStore'
import type { LessonCtx } from '../../../dashboard-scheduling/schedule-management/lesson-detail/lessonCompletion'
 

const QUESTION_PAGE_SIZE = 5
const ATTEMPTS_PAGE_SIZE = 5
const STATUS_COLORS: Record<SurveyStatus, { bg: string; text: string }> = {
  draft: { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  published: { bg: 'rgba(34,197,94,0.10)', text: '#16A34A' },

}
const TYPE_COLORS: Record<SurveyQuestionType, { bg: string; text: string }> = {
  multiple: { bg: 'rgba(59,130,246,0.10)', text: '#2563EB' },
  text: { bg: 'rgba(147,51,234,0.10)', text: '#7C3AED' },
  rating: { bg: 'rgba(6,85,92,0.12)', text: 'var(--accent)' },
  rating_with_text: { bg: 'rgba(6,85,92,0.12)', text: 'var(--accent)' },
  true_false: { bg: 'rgba(147,51,234,0.10)', text: '#7C3A00' },
}

  
interface SelectedSurveyPanelProps {
  survey: Survey
  // When true (deep-linked "Take" from lesson detail), auto-open the take modal once.
  autoStart?: boolean
  // Present only when launched from a lesson: drives completion marking + the
  // forced-submit (no X) + "return to lesson detail" behaviour.
  lessonCtx?: LessonCtx | null
  onReturnToLesson?: () => void
  //  labelBySurveyType: Record<SurveyQuestionType, string>
  labelByQuestionType: Record<string, string>
  labelByStatus: Record<SurveyStatus, string>

  pastAttempts?: StudentResponse[]
  showStatus: boolean
  onAddQuestion: () => void
  onEditQuestion: (q: SurveyQuestion) => void
  onEditSurvey: () => void
  onDeleteSurvey: () => void
  onDeleteQuestion: (id: number) => void
  onApprove: () => void
  onReject: () => void
  onTake: () => void
  onSend?: () => void
  onCloseSelectedSurveyPanel:()=>void
}

export function SelectedSurveyPanel({
  survey,
  autoStart,
  lessonCtx,
  onReturnToLesson,
  // labelBySurveyType,
  labelByQuestionType,
  labelByStatus,
  pastAttempts,
  showStatus,
  onAddQuestion,
  onEditQuestion,
  onEditSurvey,
  onDeleteSurvey,
  onDeleteQuestion,

  onTake,
  onSend,
  onCloseSelectedSurveyPanel
}: SelectedSurveyPanelProps) {
  const defaultTypeColor = { bg: 'rgba(147,51,234,0.10)', text: '#cccccc' }
  const { t } = useI18n()
  //const tc = survey. ? TYPE_COLORS[quiz.type] : defaultTypeColor
  const sc = STATUS_COLORS[survey.status]
  // const avgDiff = useMemo(() => averageDifficulty(quiz.questions), [quiz.questions])
  // const dc = avgDiff ? DIFFICULTY_COLORS[avgDiff] : null

  const [qPage, setQPage] = useState(1)
  const qTotalPages = Math.max(1, Math.ceil(survey.questions.length / QUESTION_PAGE_SIZE))

  const { surveyPermissions } = useSurveyStore(useShallow((s) => ({ surveyPermissions: s.surveyPermissions })))
  // const {hasQuizManage, hasQuizApprove, hasQuizReject, hasQuizTake, hasQuestionManage, hasQuestionView} = quizPermissions
  const { hasSurveyManage, hasSurveyTake, hasSurveyView } = surveyPermissions
  const [isSurveyFinished, setIsSurveyFinished] = useState(false);
  const [isSurveyStarted, setIsSurveyStarted] = useState(true);

 

    const { responses, listResponses } = useStudentStore(
     useShallow((s) => ({
         responses:s.responses, 
         listResponses:s.listResponses,
         
     }))
  )

  const handleSurveyTake=()=>{
    setMode('take')
    setActiveSurvey(survey.id)
  }

  // Auto-open the take modal once when this survey was reached via a "Take"
  // deep-link (lesson detail). One-shot per survey id so closing it doesn't reopen.
  const autoStartedRef = useRef<number | null>(null)
  useEffect(() => {
    if (autoStart && hasSurveyTake && autoStartedRef.current !== survey.id) {
      autoStartedRef.current = survey.id
      handleSurveyTake()
    }
  }, [autoStart, hasSurveyTake, survey.id])
  const handlePreviewSurvey=()=>{
    setMode('preview')
    setActiveSurvey(survey.id)
  }
  const handleOnCloseSelectedSurveyPanel=()=>{
    setActiveSurvey(0)

    onCloseSelectedSurveyPanel()
  }
   useEffect(() => {
  if(hasSurveyTake)
    listResponses();
  }, [listResponses])

  useEffect(() => {
    setIsSurveyFinished(responses.find(res => res.surveyId === survey.id)?.isFinished ?? false)
    setIsSurveyStarted(responses.find(res => res.surveyId === survey.id)?.isStarted ?? true)
  })
  useEffect(() => {
    setQPage(1)
  }, [survey.id])

  useEffect(() => {
    if (qPage > qTotalPages) setQPage(qTotalPages)
  }, [qPage, qTotalPages])

  const pagedQuestions = useMemo(
    () => survey.questions.slice((qPage - 1) * QUESTION_PAGE_SIZE, qPage * QUESTION_PAGE_SIZE),
    [survey.questions, qPage],
  )
  const qStartIndex = (qPage - 1) * QUESTION_PAGE_SIZE

  const attemptsList = pastAttempts ?? []
  const [aPage, setAPage] = useState(1)
  const aTotalPages = Math.max(1, Math.ceil(attemptsList.length / ATTEMPTS_PAGE_SIZE))
  useEffect(() => {
    setAPage(1)
  }, [survey.id])
  useEffect(() => {
    if (aPage > aTotalPages) setAPage(aTotalPages)
  }, [aPage, aTotalPages])
  const pagedAttempts = useMemo(
    () =>
      attemptsList.slice((aPage - 1) * ATTEMPTS_PAGE_SIZE, aPage * ATTEMPTS_PAGE_SIZE),
    [attemptsList, aPage],
  )

  type surveyMode = 'take' | 'review' | 'preview'
  const [activeSurvey, setActiveSurvey] = useState<number>(0)
  const [mode, setMode] = useState<surveyMode>('take')


 

  const authState = useAuthStore()
  let studentId = ''
  if (authState && authState.user) {
    studentId = authState.user.id.toString()
  }

  const getSurveyButtonConfig = () => {
    const resp = responses.find(res => res.surveyId === survey.id && res.studentId === studentId)
    if (!resp) return 'Start Survey'


    if (resp.isFinished) return 'Review Survey'
    if (resp.isStarted && !resp.isFinished) return 'Resume Survey'
    
    return 'Start Survey'
  }

  const takeSurveyButtonConfig= getSurveyButtonConfig();

  // const isQuizEditable = survey.status != 'rejected'

  if(!survey) return null

  return (
    <div className="px-6 py-5 flex flex-col gap-5 h-full min-h-0 overflow-hidden">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold text-primary tracking-[-0.01em]">{survey.title}</h2>
          <p className="text-[13px] text-secondary mt-1 leading-relaxed">{survey.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {showStatus && (
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: sc.bg, color: sc.text }}
            >
              {labelByStatus[survey.status]}
            </span>
          )}
          {/* <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: tc?.bg, color: tc?.text }}
          >
            {quiz.type ? labelByQuizType[quiz.type] : ''}
          </span> */}
          {/* {avgDiff && dc && (
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: dc.bg, color: dc.text }}
              title={t('quizBank.avgDifficultyHint')}
            >
              {t('quizBank.avgDifficulty')}: {labelByDifficulty[avgDiff]}
            </span>
          )} */}
        </div>
      </header>

      {/* <div className="flex items-center justify-between text-[12.5px] text-muted">
        <span>
          {t('quizBank.weight')}: <strong className="text-primary">{quiz.weight}%</strong>
        </span>
        <span>
          {quiz.questions.length} {t('quizBank.questions')}
        </span>
      </div> */}

      <div className="flex flex-wrap gap-2 pt-1">

        <>
          {
            hasSurveyManage && survey.status==='draft' &&
            <button
              className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
              onClick={onAddQuestion}
            >
              <HiOutlinePlus className="text-[14px]" />
              {t('survey.addQuestion')}
            </button>
          }
          {hasSurveyManage &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-primary text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
              onClick={onEditSurvey}
            >
              <HiOutlinePencil className="text-[14px]" />
              {t('survey.editSurvey')}
            </button>
          }
          {hasSurveyManage &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
              style={{ color: '#DC2626' }}
              onClick={onDeleteSurvey}
            >
              <HiOutlineTrash className="text-[14px]" />
              {t('survey.deleteSurvey')}
            </button>
          }
          {hasSurveyManage && survey.questions.length > 0 &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-primary text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
              onClick={handlePreviewSurvey}
            >
              <HiOutlineEye className="text-[14px]" />
              {t('survey.previewSurvey')}
            </button>
          }
          {hasSurveyManage && onSend &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-primary text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              onClick={onSend}
              disabled={survey.status !== 'published'}
              title={survey.status === 'published' ? undefined : 'Publish this survey before sending it to students'}
            >
              <HiOutlinePaperAirplane className="text-[14px]" />
              Send to students
            </button>
          }
        </>

        {hasSurveyTake && (
          <button
            className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
            //enable take quiz
            onClick={handleSurveyTake}
          >
            <HiOutlinePlayCircle className="text-[15px]" />
            {/* {isSurveyFinished && isSurveyStarted ? 'Review Survey' : !isSurveyFinished && isSurveyStarted ? 'Resume Survey' : t('survey.takeSurvey')} */}
            {takeSurveyButtonConfig}
          </button>
        )}
      </div>


      {(hasSurveyManage) && (
        <>
          <div className="flex-1 overflow-y-auto thin-scrollbar-light px-5 py-4">
            <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-3">
              {t('survey.questionsList')}
            </p>
            {survey.questions.length === 0 ? (
              <p className="text-center text-[13px] text-muted py-8">{t('survey.noQuestions')}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {pagedQuestions.map((qq, i) => (
                  <QuestionCard
                    key={qq.id}
                    index={qStartIndex + i + 1}
                    question={qq}
                    labelByQuestionType={labelByQuestionType}
                    canEdit={hasSurveyManage}
                    onEdit={() => onEditQuestion(qq)}
                    onDelete={() => onDeleteQuestion(qq.id)}
                  />
                ))}
              </ol>
            )}
          </div>

          {qTotalPages > 1 && (
            <div className="border-t border-bd">
              <Paginator page={qPage} totalPages={qTotalPages} onPageChange={setQPage} />
            </div>
          )}
        </>
      )}
      {/* Survey Take Popup */}
      <SurveyTake
        isOpen={!!activeSurvey}
        onClose={handleOnCloseSelectedSurveyPanel}
        surveyId={activeSurvey}
        studentId={studentId}
        mode={mode}
        lessonCtx={mode === 'take' ? lessonCtx : null}
        onReturnToLesson={onReturnToLesson}>

      </SurveyTake>


    </div>
  )
}

interface QuestionCardProps {
  index: number
  question: SurveyQuestion
  labelByQuestionType: Record<string, string>
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}

export function QuestionCard({
  index,
  question,
  labelByQuestionType,
  canEdit,
  onEdit,
  onDelete,
}: QuestionCardProps) {
  const { t } = useI18n()
  const typeColor =
    question.type === 'text'
      ? TYPE_COLORS.text
      : question.type === 'rating'
        ? { bg: 'rgba(245,158,11,0.12)', text: '#D97706' }
        : TYPE_COLORS.multiple
  // const diffColor = DIFFICULTY_COLORS[question.difficulty]

  return (
    <li
      className="rounded-[12px] border border-bd p-4 flex flex-col gap-2.5"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-[12px] font-bold text-accent shrink-0">Q{index}.</span>
          <p className="text-[13.5px] text-primary leading-relaxed">{question.text}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
            style={{ background: typeColor.bg, color: typeColor.text }}
          >
            {labelByQuestionType[question.type]}
          </span>
          {/* <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
            style={{ background: diffColor.bg, color: diffColor.text }}
          >
            {labelByDifficulty[question.difficulty]}
          </span> */}
          <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-accent-light text-accent"
            title={t('survey.questionWeight')}
          >
            {question.weight} {t('survey.points')}
          </span>
          {canEdit && (
            <>
              <button
                className="p-1 rounded-md hover:bg-surface text-muted hover:text-accent transition-colors border-none bg-transparent cursor-pointer"
                onClick={onEdit}
                aria-label={t('survey.editQuestion')}
              >
                <HiOutlinePencil className="text-[14px]" />
              </button>
              <button
                className="p-1 rounded-md hover:bg-surface text-muted hover:text-[#DC2626] transition-colors border-none bg-transparent cursor-pointer"
                onClick={onDelete}
                aria-label={t('survey.deleteQuestion')}
              >
                <HiOutlineTrash className="text-[14px]" />
              </button>
            </>
          )}
        </div>
      </div>

      {question.type === 'multiple' && question.options && (
        <ul className="flex flex-col gap-1 ps-6">
          {question.options.map((c, i) => {
            //const isCorrect = question.answers.includes(c)
            return (
              <li
                key={i}
                className="text-[12.5px] flex items-center gap-2"
                style={{
                  color: 'var(--accent)',
                  fontWeight: 400,
                }}
              >
                {/* {showAnswer && isCorrect && (
                  <HiOutlineCheckCircle className="text-[14px] text-accent shrink-0" />
                )} */}
                <span>{String.fromCharCode(65 + i)}.</span>
                <span>{c.text}</span>
              </li>
            )
          })}
        </ul>
      )}

      {question.type === 'text' && (
        <div className="ps-6">
          {/* <p className="text-[11px] font-bold text-accent tracking-[0.06em] uppercase mb-1">
            {t('quizBank.answer')}
          </p> */}
          {/* <p className="text-[12.5px] text-secondary leading-relaxed">
             {question.answers.join(' · ')}  
          </p> */}
        </div>
      )}

      {/* {question.type === 'true_false' && (
        <div className="ps-6 flex items-center gap-2">
          <span className="text-[11px] font-bold text-accent tracking-[0.06em] uppercase">
            {t('quizBank.correctAnswer')}:
          </span>
          {showAnswer ? (
            <span className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-accent-light text-accent">
              {question.answers[0] === 'true' ? t('quizBank.true') : t('quizBank.false')}
            </span>
          ) : (
            <span className="text-[12px] text-muted italic">
              {t('quizBank.true')} / {t('quizBank.false')}
            </span>
          )}
        </div>
      )} */}
    </li>
  )
}