import { useEffect, useMemo, useState } from 'react'
import { HiOutlineCheckCircle, HiOutlinePaperAirplane, HiOutlinePencil, HiOutlinePlayCircle, HiOutlinePlus, HiOutlineTrash, HiOutlineXCircle } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { Quiz, QuizQuestion, QuizType, ValidationStatus, Difficulty, QuizAttempt } from '../store'
import Paginator from '../../../../infra/shared/components/Paginator'
import { DIFFICULTY_COLORS, averageDifficulty } from '../constants'
import useQuizBankStore from '../store'
import { useShallow } from 'zustand/react/shallow'

const QUESTION_PAGE_SIZE = 5
const ATTEMPTS_PAGE_SIZE = 5
const STATUS_COLORS: Record<ValidationStatus, { bg: string; text: string }> = {
  pending: { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  approved: { bg: 'rgba(34,197,94,0.10)', text: '#16A34A' },
  rejected: { bg: 'rgba(220,38,38,0.10)', text: '#DC2626' },
}
const TYPE_COLORS: Record<QuizType, { bg: string; text: string }> = {
  multiple_choice: { bg: 'rgba(59,130,246,0.10)', text: '#2563EB' },
  essay: { bg: 'rgba(147,51,234,0.10)', text: '#7C3AED' },
  mixed: { bg: 'rgba(6,85,92,0.12)', text: 'var(--accent)' },
  true_false: { bg: 'rgba(147,51,234,0.10)', text: '#7C3A00' },
}

interface SelectedQuizPanelProps {
  quiz: Quiz
  labelByQuizType: Record<QuizType, string>
  labelByQuestionType: Record<string, string>
  labelByStatus: Record<ValidationStatus, string>
  labelByDifficulty: Record<Difficulty, string>
  pastAttempts?: QuizAttempt[]
  showStatus: boolean
  onAddQuestion: () => void
  onEditQuestion: (q: QuizQuestion) => void
  onEditQuiz: () => void
  onDeleteQuiz: () => void
  onDeleteQuestion: (id: number) => void
  onApprove: () => void
  onReject: () => void
  onTake: () => void
  onSend?: () => void
}

export function SelectedQuizPanel({
  quiz,
  labelByQuizType,
  labelByQuestionType,
  labelByStatus,
  labelByDifficulty,
  pastAttempts,
  showStatus,
  onAddQuestion,
  onEditQuestion,
  onEditQuiz,
  onDeleteQuiz,
  onDeleteQuestion,
  onApprove,
  onReject,
  onTake,
  onSend,
}: SelectedQuizPanelProps) {
  const defaultTypeColor = { bg: 'rgba(147,51,234,0.10)', text: '#cccccc' }
  const { t } = useI18n()
  const tc = quiz.type ? TYPE_COLORS[quiz.type] : defaultTypeColor
  const sc = STATUS_COLORS[quiz.status]
  const avgDiff = useMemo(() => averageDifficulty(quiz.questions), [quiz.questions])
  const dc = avgDiff ? DIFFICULTY_COLORS[avgDiff] : null

  const [qPage, setQPage] = useState(1)
  const qTotalPages = Math.max(1, Math.ceil(quiz.questions.length / QUESTION_PAGE_SIZE))

  const {quizPermissions} = useQuizBankStore(useShallow((s) => ({quizPermissions: s.quizPermissions})))
  const {hasQuizManage, hasQuizApprove, hasQuizReject, hasQuizTake, hasQuestionManage, hasQuestionView} = quizPermissions

  useEffect(() => {
    setQPage(1)
  }, [quiz.id])

  useEffect(() => {
    if (qPage > qTotalPages) setQPage(qTotalPages)
  }, [qPage, qTotalPages])

  const pagedQuestions = useMemo(
    () => quiz.questions.slice((qPage - 1) * QUESTION_PAGE_SIZE, qPage * QUESTION_PAGE_SIZE),
    [quiz.questions, qPage],
  )
  const qStartIndex = (qPage - 1) * QUESTION_PAGE_SIZE

  const attemptsList = pastAttempts ?? []
  const [aPage, setAPage] = useState(1)
  const aTotalPages = Math.max(1, Math.ceil(attemptsList.length / ATTEMPTS_PAGE_SIZE))
  useEffect(() => {
    setAPage(1)
  }, [quiz.id])
  useEffect(() => {
    if (aPage > aTotalPages) setAPage(aTotalPages)
  }, [aPage, aTotalPages])
  const pagedAttempts = useMemo(
    () =>
      attemptsList.slice((aPage - 1) * ATTEMPTS_PAGE_SIZE, aPage * ATTEMPTS_PAGE_SIZE),
    [attemptsList, aPage],
  )

  const isQuizEditable = quiz.status != 'rejected'

  return (
    <div className="px-6 py-5 flex flex-col gap-5 h-full min-h-0 overflow-hidden">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold text-primary tracking-[-0.01em]">{quiz.name}</h2>
          <p className="text-[13px] text-secondary mt-1 leading-relaxed">{quiz.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {showStatus && (
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: sc.bg, color: sc.text }}
            >
              {labelByStatus[quiz.status]}
            </span>
          )}
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: tc?.bg, color: tc?.text }}
          >
            {quiz.type ? labelByQuizType[quiz.type] : ''}
          </span>
          {avgDiff && dc && (
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: dc.bg, color: dc.text }}
              title={t('quizBank.avgDifficultyHint')}
            >
              {t('quizBank.avgDifficulty')}: {labelByDifficulty[avgDiff]}
            </span>
          )}
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
        {
          (hasQuestionManage || hasQuizManage) && (
          <>
            {
            hasQuestionManage && isQuizEditable &&
            <button
              className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
              onClick={onAddQuestion}
            >
              <HiOutlinePlus className="text-[14px]" />
              {t('quizBank.addQuestion')}
            </button>
            }
            {
            hasQuizManage && isQuizEditable &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-primary text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
              onClick={onEditQuiz}
            >
              <HiOutlinePencil className="text-[14px]" />
              {t('quizBank.editQuiz')}
            </button>
            }
            {
            hasQuizManage && isQuizEditable &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
              style={{ color: 'var(--danger)' }}
              onClick={onDeleteQuiz}
            >
              <HiOutlineTrash className="text-[14px]" />
              {t('quizBank.deleteQuiz')}
            </button>
            }
            {
            hasQuizManage && onSend &&
            <button
              className="inline-flex items-center gap-1.5 bg-transparent text-primary text-[12.5px] font-semibold py-2 px-3 rounded-[10px] border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              onClick={onSend}
              disabled={quiz.status !== 'approved'}
              title={quiz.status === 'approved' ? undefined : 'Approve this quiz before sending it to students'}
            >
              <HiOutlinePaperAirplane className="text-[14px]" />
              Send to students
            </button>
            }
          </>
        )}
        {
        hasQuizApprove &&
        <button
          className="inline-flex items-center gap-1.5 text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50"
          style={{ background: 'var(--success)' }}
          onClick={onApprove}
          disabled={quiz.status === 'approved'}
        >
          <HiOutlineCheckCircle className="text-[14px]" />
          {t('quizBank.approve')}
        </button>
        }
        {
        hasQuizReject &&
        <button
          className="inline-flex items-center gap-1.5 text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50"
          style={{ background: 'var(--danger)' }}
          onClick={onReject}
          disabled={quiz.status === 'rejected'}
        >
          <HiOutlineXCircle className="text-[14px]" />
          {t('quizBank.reject')}
        </button>
        }    

        {hasQuizTake && (
          <button
            className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
            //enable take quiz
            onClick={onTake}
          >
            <HiOutlinePlayCircle className="text-[15px]" />
            {t('quizBank.takeQuiz')}
          </button>
        )}
      </div>
      {pastAttempts && (attemptsList.length > 0 || hasQuizTake) && (
        <div className="px-5 py-4 border-t border-bd flex flex-col gap-2 overflow-y-auto thin-scrollbar-light">
          <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-1">
            {t('quizBank.pastAttempts')}
          </p>
          {attemptsList.length === 0 ? (
            <p className="text-[12.5px] text-muted">{t('quizBank.noAttempts')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pagedAttempts.map((a) => {
                const pct =
                  a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0
                return (
                  <li
                    key={a.id}
                    className="rounded-[10px] border border-bd p-3 flex items-center justify-between gap-3"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[12.5px] text-secondary">
                        {new Date(a.submitted_at).toLocaleString()}
                      </span>
                      {a.has_essay && (
                        <span className="text-[11px] text-muted italic">
                          {t('quizBank.essayPendingReview')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5 shrink-0">
                      <span className="text-[15px] font-bold text-primary">
                        {a.score}
                      </span>
                      <span className="text-[12.5px] text-muted">
                        / {a.max_score}
                      </span>
                      <span className="text-[11.5px] text-accent font-semibold">
                        ({pct}%)
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {aTotalPages > 1 && (
            <Paginator page={aPage} totalPages={aTotalPages} onPageChange={setAPage} />
          )}
        </div>
      )}

      {(hasQuestionView || hasQuestionManage || hasQuizApprove || hasQuizManage) && (
      <>
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-5 py-4">
        <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-3">
          {t('quizBank.questionsList')}
        </p>
        {quiz.questions.length === 0 ? (
          <p className="text-center text-[13px] text-muted py-8">{t('quizBank.noQuestions')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {pagedQuestions.map((qq, i) => (
              <QuestionCard
                key={qq.id}
                index={qStartIndex + i + 1}
                question={qq}
                labelByQuestionType={labelByQuestionType}
                labelByDifficulty={labelByDifficulty}
                showAnswer={hasQuestionManage || hasQuizApprove || hasQuizReject}
                canEdit={hasQuestionManage && isQuizEditable}
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
    </div>
  )
}

interface QuestionCardProps {
  index: number
  question: QuizQuestion
  labelByQuestionType: Record<string, string>
  labelByDifficulty: Record<Difficulty, string>
  showAnswer: boolean
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}

export function QuestionCard({
  index,
  question,
  labelByQuestionType,
  labelByDifficulty,
  showAnswer,
  canEdit,
  onEdit,
  onDelete,
}: QuestionCardProps) {
  const { t } = useI18n()
  const typeColor =
    question.type === 'essay'
      ? TYPE_COLORS.essay
      : question.type === 'true_false'
        ? { bg: 'rgba(245,158,11,0.12)', text: '#D97706' }
        : TYPE_COLORS.multiple_choice
  const diffColor = DIFFICULTY_COLORS[question.difficulty]

  return (
    <li
      className="rounded-[12px] border border-bd p-4 flex flex-col gap-2.5"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-[12px] font-bold text-accent shrink-0">Q{index}.</span>
          <p className="text-[13.5px] text-primary leading-relaxed">{question.description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
            style={{ background: typeColor.bg, color: typeColor.text }}
          >
            {labelByQuestionType[question.type]}
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
            style={{ background: diffColor.bg, color: diffColor.text }}
          >
            {labelByDifficulty[question.difficulty]}
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-accent-light text-accent"
            title={t('quizBank.questionWeight')}
          >
            {question.weight} {t('quizBank.points')}
          </span>
          {canEdit && (
            <>
              <button
                className="p-1 rounded-md hover:bg-surface text-muted hover:text-accent transition-colors border-none bg-transparent cursor-pointer"
                onClick={onEdit}
                aria-label={t('quizBank.editQuestion')}
              >
                <HiOutlinePencil className="text-[14px]" />
              </button>
              <button
                className="p-1 rounded-md hover:bg-surface text-muted hover:text-[var(--danger)] transition-colors border-none bg-transparent cursor-pointer"
                onClick={onDelete}
                aria-label={t('quizBank.deleteQuestion')}
              >
                <HiOutlineTrash className="text-[14px]" />
              </button>
            </>
          )}
        </div>
      </div>

      {question.type === 'multiple_choice' && question.choices && (
        <ul className="flex flex-col gap-1 ps-6">
          {question.choices.map((c, i) => {
            const isCorrect = question.answers.includes(c)
            return (
              <li
                key={i}
                className="text-[12.5px] flex items-center gap-2"
                style={{
                  color: showAnswer && isCorrect ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: showAnswer && isCorrect ? 600 : 400,
                }}
              >
                {showAnswer && isCorrect && (
                  <HiOutlineCheckCircle className="text-[14px] text-accent shrink-0" />
                )}
                <span>{String.fromCharCode(65 + i)}.</span>
                <span>{c}</span>
              </li>
            )
          })}
        </ul>
      )}

      {showAnswer && question.type === 'essay' && (
        <div className="ps-6">
          <p className="text-[11px] font-bold text-accent tracking-[0.06em] uppercase mb-1">
            {t('quizBank.answer')}
          </p>
          <p className="text-[12.5px] text-secondary leading-relaxed">
            {question.answers.join(' · ')}
          </p>
        </div>
      )}

      {question.type === 'true_false' && (
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
      )}
    </li>
  )
}