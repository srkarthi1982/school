import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlinePlus, HiOutlineAcademicCap, HiOutlineEye, HiOutlinePencilSquare, HiOutlinePlay } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import type { PermissionCode } from '../../../infra/shared/types/permissions'
import Paginator from '../../../infra/shared/components/Paginator'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'
import useQuizBankStore, {
  type Quiz,
  type QuizQuestion,
  type QuizType,
  type QuestionType,
  type ValidationStatus
} from './store'
import {STATUS_COLORS, TYPE_COLORS, VIEW_ROLES, DIFFICULTY_COLORS, averageDifficulty} from './constants'
import {QuizFormModal} from './components/quiz-form-modal'
import {SelectedQuizPanel} from './components/selected-quiz-panel'
import {TakeQuizModal} from './components/take-quiz-modal'
import SendToStudentsModal from '../../../infra/shared/components/SendToStudentsModal'
import {completeLessonContentIfLinked, readLessonCtx, type LessonCtx} from '../../dashboard-scheduling/schedule-management/lesson-detail/lessonCompletion'
import { useNavigate } from 'react-router-dom'
import { QuestionFormModal, type ExistingQuestionEntry } from './components/question-form-modal'
import { ALL_PERMISSION_CODES } from '../../../infra/shared/types/permissions.gen'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'

const PAGE_SIZE = 6

type ViewRole = 'teacher' | 'student' | 'admin'


export default function QuizBankPage() {
  const { t } = useI18n()
  const permissions = useAuthStore(selectUserPermissions) as unknown as Set<PermissionCode>
  
  const [viewRole, setViewRole] = useState<ViewRole>(() => 'teacher')

  const {
    quizzes,
    selectedQuizId,
    loaded,
    quizPermissions,
    fetchQuizzes,
    selectQuiz,
    addQuiz,
    updateQuiz,
    removeQuiz,
    setQuizStatus,
    addQuestion,
    updateQuestion,
    removeQuestion,
    attempts,
    fetchAttempts,
    submitAttempt,
    updatePermission,
    fetchAssignedQuizzes,
    fetchEligibleTakers,
    eligibleTakers,
    getRecipients,
    setRecipients,
  } = useQuizBankStore(
    useShallow((s) => ({
      quizzes: s.quizzes,
      selectedQuizId: s.selectedQuizId,
      loaded: s.loaded,
      quizPermissions: s.quizPermissions,
      fetchQuizzes: s.fetchQuizzes,
      selectQuiz: s.selectQuiz,
      addQuiz: s.addQuiz,
      updateQuiz: s.updateQuiz,
      removeQuiz: s.removeQuiz,
      setQuizStatus: s.setQuizStatus,
      addQuestion: s.addQuestion,
      updateQuestion: s.updateQuestion,
      removeQuestion: s.removeQuestion,
      attempts: s.attempts,
      fetchAttempts: s.fetchAttempts,
      submitAttempt: s.submitAttempt,
      updatePermission: s.updatePermission,
      fetchAssignedQuizzes: s.fetchAssignedQuizzes,
      fetchEligibleTakers: s.fetchEligibleTakers,
      eligibleTakers: s.eligibleTakers,
      getRecipients: s.getRecipients,
      setRecipients: s.setRecipients,
    })),
  )

  // A pure taker (student) only sees quizzes sent to them and not yet taken;
  // everyone who can manage/approve keeps the full list.
  const isPureTaker =
    permissions.has('quiz:take') &&
    !permissions.has('quiz:manage') &&
    !permissions.has('quiz:approve') &&
    !permissions.has('quiz:reject')

  useEffect(() => {
    if (isPureTaker) void fetchAssignedQuizzes()
    else void fetchQuizzes()
  }, [isPureTaker, fetchQuizzes, fetchAssignedQuizzes])

  useEffect(() => {
    updatePermission({
      hasQuizView: permissions.has('quiz:view'),
      hasQuizManage: permissions.has('quiz:manage'),
      hasQuizApprove: permissions.has('quiz:approve'),
      hasQuizReject: permissions.has('quiz:reject'),
      hasQuizTake: permissions.has('quiz:take'),
      hasQuestionView: permissions.has('question:view'),
      hasQuestionManage: permissions.has('question:manage'),
    })
  }, [permissions])
  
  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId) ?? null,
    [quizzes, selectedQuizId],
  )

  const {hasQuizManage, hasQuizApprove, hasQuizReject, hasQuizTake} = quizPermissions
  const canShowQuizStatus = hasQuizManage || hasQuizApprove || hasQuizReject
  
  useEffect(() => {
    if (hasQuizTake) void fetchAttempts()
  }, [hasQuizTake, fetchAttempts])


  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null)
  const [quizModalMode, setQuizModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null)
  const [questionModalMode, setQuestionModalMode] = useState<'create' | 'edit' | null>(null)
  const navigate = useNavigate()
  const [takingQuiz, setTakingQuiz] = useState<Quiz | null>(null)
  // "Send to students" modal state: the quiz being sent + its current recipients.
  const [sendQuiz, setSendQuiz] = useState<Quiz | null>(null)
  const [sendRecipients, setSendRecipients] = useState<{ studentIds: number[]; completedStudentIds: number[] } | null>(null)

  const openSend = async (quiz: Quiz) => {
    setSendQuiz(quiz)
    setSendRecipients(null)
    void fetchEligibleTakers()
    try {
      setSendRecipients(await getRecipients(quiz.id))
    } catch {
      setSendRecipients({ studentIds: [], completedStudentIds: [] })
    }
  }
  // Deep-link from lesson detail (?take=<quizId>&lessonCtx=<cid>:<lid>): auto-open
  // the take modal once quizzes are loaded. lessonCtx is captured so we can mark
  // completion and return to the lesson detail on submit (and force-submit there).
  const [autoOpened, setAutoOpened] = useState(false)
  const [lessonCtx, setLessonCtx] = useState<LessonCtx | null>(null)
  useEffect(() => {
    if (autoOpened || !loaded) return
    const take = new URLSearchParams(window.location.search).get('take')
    if (!take) return
    const q = quizzes.find((x) => x.id === Number(take))
    if (q) {
      setTakingQuiz(q)
      setLessonCtx(readLessonCtx(window.location.search))
      setAutoOpened(true)
    }
  }, [autoOpened, loaded, quizzes])

  const labelByQuizType: Record<QuizType, string> = {
    multiple_choice: t('quizBank.types.multipleChoice'),
    essay: t('quizBank.types.essay'),
    mixed: t('quizBank.types.mixed'),
    true_false: t('quizBank.types.trueFalse'),
  }
  const labelByQuestionType: Record<QuestionType, string> = {
    multiple_choice: t('quizBank.types.multipleChoice'),
    essay: t('quizBank.types.essay'),
    true_false: t('quizBank.types.trueFalse'),
  }
  const labelByStatus: Record<ValidationStatus, string> = {
    pending: t('quizBank.status.pending'),
    approved: t('quizBank.status.approved'),
    rejected: t('quizBank.status.rejected'),
  }
  const labelByDifficulty: Record<'easy' | 'medium' | 'difficult', string> = {
    easy: t('quizBank.difficulties.easy'),
    medium: t('quizBank.difficulties.medium'),
    difficult: t('quizBank.difficulties.difficult'),
  }
  const labelByViewRole: Record<ViewRole, string> = {
    teacher: t('quizBank.roles.teacher'),
    student: t('quizBank.roles.student'),
    admin: t('quizBank.roles.admin'),
  }

  const visibleQuizzes = useMemo(
    () => (!canShowQuizStatus ? quizzes.filter((q) => q.status === 'approved') : quizzes),
    [quizzes, canShowQuizStatus],
  )

  const existingQuestionsForBrowse = useMemo<ExistingQuestionEntry[]>(() => {
    if (!selectedQuiz) return []
    const currentDescriptions = new Set(
      selectedQuiz.questions.map((qq) => qq.description.trim().toLowerCase()),
    )
    return quizzes.flatMap((qz) =>
      qz.id === selectedQuiz.id || qz.status != 'approved'
        ? []
        : qz.questions
            .filter((qq) => !currentDescriptions.has(qq.description.trim().toLowerCase()))
            .map((qq) => ({ question: qq, quizId: qz.id, quizName: qz.name })),
    )
  }, [quizzes, selectedQuiz])

  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(visibleQuizzes.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [viewRole])

  const pagedQuizzes = useMemo(
    () => visibleQuizzes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleQuizzes, page],
  )

  const rangeStart = visibleQuizzes.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(visibleQuizzes.length, page * PAGE_SIZE)

  const openCreateQuiz = () => {
    setEditingQuiz(null)
    setQuizModalMode('create')
  }
  const openEditQuiz = (q: Quiz) => {
    setEditingQuiz(q)
    setQuizModalMode('edit')
  }
  const closeQuizModal = () => {
    setQuizModalMode(null)
    setEditingQuiz(null)
  }

  const openCreateQuestion = () => {
    setEditingQuestion(null)
    setQuestionModalMode('create')
  }
  const openEditQuestion = (qq: QuizQuestion) => {
    setEditingQuestion(qq)
    setQuestionModalMode('edit')
  }
  const closeQuestionModal = () => {
    setQuestionModalMode(null)
    setEditingQuestion(null)
  }

  const defaultTypeColor = { bg: 'rgba(147,51,234,0.10)', text: '#cccccc' }
  return (
    <div className="flex flex-col gap-5 h-full min-h-0 overflow-hidden">
      <SectionHeader
        icon={<HiOutlineAcademicCap />}
        eyebrow={t('common.management')}
        title={t('quizBank.title')}
        description={t('quizBank.intro')}
      />
      {/* to be enabled */}
      {/* <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-[10.5px] font-bold text-muted tracking-[0.07em] uppercase">
            {t('quizBank.viewAs')}
          </span>
          <div
            className="inline-flex p-1 rounded-[10px] border border-bd"
            style={{ background: 'var(--surface-2)' }}
          >
            {VIEW_ROLES.map((r) => {
              const active = r === viewRole
              return (
                <button
                  key={r}
                  onClick={() => setViewRole(r)}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none cursor-pointer transition-colors"
                  style={{
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--text-muted)',
                  }}
                >
                  {labelByViewRole[r]}
                </button>
              )
            })}
          </div>
          {role && (
            <span className="text-[10.5px] text-muted">
              {t('quizBank.actualRole')}: <strong>{role}</strong>
            </span>
          )}
        </div> */}
      {/* end of tobe enabled */}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr] gap-4 min-h-0 flex-1">
        <section className="card flex flex-col min-h-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-bd flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase">
                {t('quizBank.quizzes')}
              </p>
              <p className="text-[12.5px] text-secondary mt-0.5">
                {visibleQuizzes.length === 0
                  ? `0 ${t('quizBank.totalQuizzes')}`
                  : `${rangeStart}–${rangeEnd} ${t('quizBank.of')} ${visibleQuizzes.length}`}
              </p>
            </div>
            {quizPermissions?.hasQuizManage && (
              <button
                data-guide="quiz-bank:create"
                className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
                //enable add quiz
                onClick={openCreateQuiz}
              >
                <HiOutlinePlus className="text-[14px]" />
                {t('quizBank.createQuiz')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto thin-scrollbar-light">
            {visibleQuizzes.length === 0 ? (
              <EmptyState
                bare
                icon={<HiOutlineAcademicCap />}
                title={t('quizBank.noQuizzes')}
                description={t('empty.quizBank.noQuizzesDesc')}
              />
            ) : (
              <ul className="flex flex-col">
                {pagedQuizzes.map((q) => {
                  const isActive = q.id === selectedQuizId
                  const tc = q.type ? TYPE_COLORS[q.type] : defaultTypeColor
                  const sc = STATUS_COLORS[q.status]
                  const avgDiff = averageDifficulty(q.questions)
                  const dc = avgDiff ? DIFFICULTY_COLORS[avgDiff] : null
                  return (
                    <li key={q.id}>
                      <button
                        className="w-full text-start px-5 py-3.5 border-b border-bd cursor-pointer transition-colors"
                        style={{
                          background: isActive ? 'var(--accent-light)' : 'transparent',
                        }}
                        onClick={() => selectQuiz(q.id)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h3 className="text-[14px] font-bold text-primary leading-snug">
                            {q.name}
                          </h3>
                          {canShowQuizStatus && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
                              style={{ background: sc.bg, color: sc.text }}
                            >
                              {labelByStatus[q.status]}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-secondary line-clamp-2 mb-2">
                          {q.description}
                        </p>
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
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
                          </div>
                          <span className="text-muted shrink-0">
                            {q.questions.length} {t('quizBank.questions')} · {t('quizBank.weight')}{' '}
                            {q.weight}%
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
          {!selectedQuiz ? (
            <div className="flex-1 flex flex-col min-h-0">
              <EmptyState
                fill
                bare
                icon={<HiOutlineAcademicCap />}
                title={t('quizBank.selectQuiz')}
                description={t('empty.quizBank.selectDesc')}
                hints={[
                  { icon: <HiOutlineEye />, title: t('empty.quizBank.previewTitle'), description: t('empty.quizBank.previewDesc') },
                  { icon: <HiOutlinePencilSquare />, title: t('empty.quizBank.manageTitle'), description: t('empty.quizBank.manageDesc') },
                  { icon: <HiOutlinePlay />, title: t('empty.quizBank.takeTitle'), description: t('empty.quizBank.takeDesc') },
                ]}
              />
            </div>
          ) : (
            <SelectedQuizPanel
              quiz={selectedQuiz}
              labelByQuizType={labelByQuizType}
              labelByQuestionType={labelByQuestionType}
              labelByStatus={labelByStatus}
              labelByDifficulty={labelByDifficulty}
              pastAttempts={attempts.filter((a) => a.quiz_id === selectedQuiz.id)}
              showStatus={canShowQuizStatus}
              onAddQuestion={openCreateQuestion}
              onEditQuestion={openEditQuestion}
              onEditQuiz={() => openEditQuiz(selectedQuiz)}
              onDeleteQuiz={async () => {
                if (
                  await confirmDialog({
                    title: t('quizBank.confirmDeleteQuiz'),
                    confirmLabel: t('common.delete') ?? 'Delete',
                    tone: 'danger',
                  })
                )
                  void removeQuiz(selectedQuiz.id)
              }}
              onDeleteQuestion={async (qid) => {
                if (
                  await confirmDialog({
                    title: t('quizBank.confirmDeleteQuestion'),
                    confirmLabel: t('common.delete') ?? 'Delete',
                    tone: 'danger',
                  })
                )
                  void removeQuestion(selectedQuiz.id, qid)
              }}
              onApprove={() => void setQuizStatus(selectedQuiz.id, 'approved')}
              onReject={() => void setQuizStatus(selectedQuiz.id, 'rejected')}
              onTake={() => setTakingQuiz(selectedQuiz)}
              onSend={() => void openSend(selectedQuiz)}
            />
          )}
        </section>
      </div>

      {quizModalMode && (
        <QuizFormModal
          mode={quizModalMode}
          initial={editingQuiz}
          onClose={closeQuizModal}
          onSubmit={async (payload) => {
            if (quizModalMode === 'edit' && editingQuiz)
              await updateQuiz(editingQuiz.id, payload)
            else await addQuiz(payload)
            closeQuizModal()
          }}
          labelByQuizType={labelByQuizType}
        />
      )}

      {questionModalMode && selectedQuiz && (
        <QuestionFormModal
          mode={questionModalMode}
          initial={editingQuestion}
          onClose={closeQuestionModal}
          onSubmit={async (payload) => {
            if (questionModalMode === 'edit' && editingQuestion)
              await updateQuestion(selectedQuiz.id, editingQuestion.id, payload)
            else await addQuestion(selectedQuiz.id, payload)
            closeQuestionModal()
          }}
          labelByQuestionType={labelByQuestionType}
          existingQuestions={existingQuestionsForBrowse}
        />
      )}

      {takingQuiz && (
        <TakeQuizModal
          quiz={takingQuiz}
          labelByQuestionType={labelByQuestionType}
          // From a lesson: must submit (no X until results), then close returns
          // to the lesson detail; otherwise the X just closes the modal.
          fromLesson={!!lessonCtx}
          onClose={() => {
            if (lessonCtx) navigate(-1)
            else {
              setTakingQuiz(null)
              // A student's list only holds quizzes they haven't taken — refresh
              // so a just-submitted quiz drops off without a manual reload.
              if (isPureTaker) void fetchAssignedQuizzes()
            }
          }}
          onSubmit={async (quizId: number, payload: Parameters<typeof submitAttempt>[1]) => {
            const res = await submitAttempt(quizId, payload)
            // If sent here from a lesson, mark it complete so it can't be retaken there.
            await completeLessonContentIfLinked('quiz', quizId, lessonCtx)
            return res
          }}
        />
      )}

      {sendQuiz && sendRecipients && (
        <SendToStudentsModal
          kindLabel="quiz"
          itemTitle={sendQuiz.name}
          roster={eligibleTakers}
          initialSelectedIds={sendRecipients.studentIds}
          lockedIds={sendRecipients.completedStudentIds}
          onClose={() => {
            setSendQuiz(null)
            setSendRecipients(null)
          }}
          onSave={async (ids) => {
            await setRecipients(sendQuiz.id, ids)
          }}
        />
      )}
    </div>
  )
}
