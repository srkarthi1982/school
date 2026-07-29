import { useMemo, useState } from 'react'
import { HiOutlineCheckCircle, HiOutlineExclamationCircle, HiOutlinePencil } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { Quiz, QuizQuestion, QuizType, QuizAttempt } from '../store'
import { ModalShell } from '../ui/modal-shell'
import Paginator from '../../../../infra/shared/components/Paginator'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'

const TAKE_QUIZ_PAGE_SIZE = 3
const TYPE_COLORS: Record<QuizType, { bg: string; text: string }> = {
  multiple_choice: { bg: 'rgba(59,130,246,0.10)', text: '#2563EB' },
  essay: { bg: 'rgba(147,51,234,0.10)', text: '#7C3AED' },
  mixed: { bg: 'rgba(6,85,92,0.12)', text: 'var(--accent)' },
  true_false: { bg: 'rgba(147,51,234,0.10)', text: '#7C3A00' },
}

interface TakeQuizModalProps {
  quiz: Quiz
  labelByQuestionType: Record<string, string>
  onClose: () => void
  // When launched from a lesson, the student must submit: the close (X) is hidden
  // until results are shown, after which closing returns them to the lesson.
  fromLesson?: boolean
  onSubmit: (
    quizId: number,
    answers: Array<{ question_id: number; answer: string[]; text: string | null }>,
  ) => Promise<QuizAttempt>
}

export function TakeQuizModal({ quiz, labelByQuestionType, onClose, fromLesson, onSubmit }: TakeQuizModalProps) {
  const { t } = useI18n()
  const [mcAnswers, setMcAnswers] = useState<Record<number, string[]>>({})
  const [essayAnswers, setEssayAnswers] = useState<Record<number, string>>({})
  const [tfAnswers, setTfAnswers] = useState<Record<number, 'true' | 'false'>>({})
  const [submitted, setSubmitted] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [attemptResult, setAttemptResult] = useState<QuizAttempt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [tPage, setTPage] = useState(1)
  const tTotalPages = Math.max(1, Math.ceil(quiz.questions.length / TAKE_QUIZ_PAGE_SIZE))
  const tStartIndex = (tPage - 1) * TAKE_QUIZ_PAGE_SIZE
  const pagedQuestions = useMemo(
    () => quiz.questions.slice(tStartIndex, tStartIndex + TAKE_QUIZ_PAGE_SIZE),
    [quiz.questions, tStartIndex],
  )
  const isLastPage = tPage >= tTotalPages

  const isAnswered = (q: QuizQuestion): boolean => {
    if (q.type === 'multiple_choice') return (mcAnswers[q.id] ?? []).length > 0
    if (q.type === 'true_false') return tfAnswers[q.id] !== undefined
    return (essayAnswers[q.id] ?? '').trim().length > 0
  }

  const answeredCount = useMemo(
    () => quiz.questions.reduce((n, q) => n + (isAnswered(q) ? 1 : 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quiz.questions, mcAnswers, essayAnswers, tfAnswers],
  )

  const unansweredCount = quiz.questions.length - answeredCount

  const toggleMc = (qid: number, choice: string) => {
    setMcAnswers((s) => {
      const current = s[qid] ?? []
      const next = current.includes(choice)
        ? current.filter((c) => c !== choice)
        : [...current, choice]
      return { ...s, [qid]: next }
    })
  }

  const jumpToQuestion = (globalIndex: number) => {
    setTPage(Math.floor(globalIndex / TAKE_QUIZ_PAGE_SIZE) + 1)
    setReviewing(false)
  }

  const renderAnswerSummary = (q: QuizQuestion) => {
    if (q.type === 'multiple_choice') {
      const selected = mcAnswers[q.id] ?? []
      if (selected.length === 0) return null
      return (
        <ul className="flex flex-col gap-0.5 ps-6">
          {selected.map((c, i) => (
            <li key={i} className="text-[12.5px] text-primary flex items-center gap-2">
              <HiOutlineCheckCircle className="text-[14px] text-accent shrink-0" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )
    }
    if (q.type === 'true_false') {
      const v = tfAnswers[q.id]
      if (!v) return null
      return (
        <p className="ps-6 text-[12.5px] text-primary flex items-center gap-2">
          <HiOutlineCheckCircle className="text-[14px] text-accent shrink-0" />
          <span>{v === 'true' ? t('quizBank.true') : t('quizBank.false')}</span>
        </p>
      )
    }
    const text = (essayAnswers[q.id] ?? '').trim()
    if (!text) return null
    return (
      <p
        className="ms-6 text-[12.5px] text-primary leading-relaxed whitespace-pre-wrap rounded-[8px] border border-bd p-2.5"
        style={{ background: 'var(--surface)' }}
      >
        {text}
      </p>
    )
  }

  const headerHint = submitted
    ? t('quizBank.takeQuizHint')
    : reviewing
      ? t('quizBank.reviewHint')
      : t('quizBank.takeQuizHint')

  return (
    <ModalShell title={quiz.name} hint={headerHint} onClose={onClose} hideClose={!!fromLesson && !submitted} fullScreen>
      {quiz.questions.length > 0 && (
        <div className="px-6 pt-4 pb-2 flex items-center justify-between text-[12px] text-muted border-b border-bd">
          <span>
            {reviewing || submitted
              ? t('quizBank.reviewSummary')
              : `${t('quizBank.questionsList')}: ${tStartIndex + 1}–${Math.min(
                  quiz.questions.length,
                  tStartIndex + TAKE_QUIZ_PAGE_SIZE,
                )} ${t('quizBank.of')} ${quiz.questions.length}`}
          </span>
          <span>
            {t('quizBank.answered')}:{' '}
            <strong className="text-primary">
              {answeredCount}/{quiz.questions.length}
            </strong>
          </span>
        </div>
      )}

      <div className="p-6 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto thin-scrollbar-light">
        {quiz.questions.length === 0 ? (
          <p className="text-center text-[13px] text-muted py-6">{t('quizBank.noQuestions')}</p>
        ) : reviewing || submitted ? (
          <>
            {!submitted && unansweredCount > 0 && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                style={{
                  background: 'rgba(245,158,11,0.10)',
                  color: '#D97706',
                  border: '1px solid rgba(245,158,11,0.25)',
                }}
              >
                <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
                <span>
                  {unansweredCount} {t('quizBank.questionsUnansweredHint')}
                </span>
              </div>
            )}

            {quiz.questions.map((qq, i) => {
              const answered = isAnswered(qq)
              return (
                <div
                  key={qq.id}
                  className="rounded-[12px] border border-bd p-4 flex flex-col gap-2.5"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-[12px] font-bold text-accent shrink-0">Q{i + 1}.</span>
                      <p className="text-[13.5px] text-primary leading-relaxed">{qq.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* <span
                        className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                        style={{
                          background: answered
                            ? 'var(--success-light)'
                            : 'var(--warning-light)',
                          color: answered ? 'var(--success)' : 'var(--warning)',
                        }}
                      >
                        {answered ? t('quizBank.answered') : t('quizBank.notAnswered')}
                      </span> */}
                      {!submitted && (
                        <button
                          type="button"
                          onClick={() => jumpToQuestion(i)}
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent bg-transparent border-none cursor-pointer hover:underline"
                        >
                          <HiOutlinePencil className="text-[12px]" />
                          {t('common.edit')}
                        </button>
                      )}
                    </div>
                  </div>
                  {answered ? (
                    renderAnswerSummary(qq)
                  ) : (
                    <p className="ps-6 text-[12px] italic text-muted">
                      {t('quizBank.notAnsweredHint')}
                    </p>
                  )}
                </div>
              )
            })}
          </>
        ) : (
          pagedQuestions.map((qq, i) => (
            <div
              key={qq.id}
              className="rounded-[12px] border border-bd p-4 flex flex-col gap-2.5"
              style={{ background: 'var(--surface-2)' }}
            >
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-bold text-accent shrink-0">
                  Q{tStartIndex + i + 1}.
                </span>
                <p className="text-[13.5px] text-primary leading-relaxed">{qq.description}</p>
              </div>
              <div className="flex items-center gap-2 ps-6">
                <p className="text-[10.5px] font-semibold text-muted">
                  {labelByQuestionType[qq.type]}
                </p>
                {qq.type === 'multiple_choice' && qq.answers.length > 1 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                  >
                    {t('quizBank.selectAllThatApply')}
                  </span>
                )}
              </div>

              {qq.type === 'multiple_choice' && qq.choices ? (
                <div className="flex flex-col gap-1.5 ps-6">
                  {qq.choices.map((c, idx) => {
                    const isMulti = qq.answers.length > 1
                    const checked = (mcAnswers[qq.id] ?? []).includes(c)
                    return (
                      <label
                        key={idx}
                        className="flex items-center gap-2 text-[13px] text-secondary cursor-pointer"
                      >
                        <input
                          type={isMulti ? 'checkbox' : 'radio'}
                          name={isMulti ? undefined : `q-${qq.id}`}
                          checked={checked}
                          onChange={() => {
                            if (isMulti) toggleMc(qq.id, c)
                            else setMcAnswers((s) => ({ ...s, [qq.id]: [c] }))
                          }}
                          disabled={submitted}
                          className="accent-[var(--accent)]"
                        />
                        <span>{c}</span>
                      </label>
                    )
                  })}
                </div>
              ) : qq.type === 'true_false' ? (
                <div className="flex gap-2 ps-6">
                  {(['true', 'false'] as const).map((v) => {
                    const active = tfAnswers[qq.id] === v
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTfAnswers((s) => ({ ...s, [qq.id]: v }))}
                        disabled={submitted}
                        className="flex-1 px-3 py-2 rounded-[10px] border text-[13px] font-semibold cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--surface)',
                          color: active ? '#FFFFFF' : 'var(--text-muted)',
                          borderColor: active ? 'var(--accent)' : 'var(--border)',
                        }}
                      >
                        {v === 'true' ? t('quizBank.true') : t('quizBank.false')}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <textarea
                  value={essayAnswers[qq.id] ?? ''}
                  onChange={(e) => setEssayAnswers((s) => ({ ...s, [qq.id]: e.target.value }))}
                  disabled={submitted}
                  rows={3}
                  className="ms-6 px-3 py-2 rounded-[10px] border border-bd bg-surface text-primary text-[13px] outline-none focus:border-accent resize-none"
                />
              )}
            </div>
          ))
        )}

        {/* {submitted && attemptResult && (
          <div
            className="rounded-[12px] border p-4 flex flex-col gap-2"
            style={{
              background: 'var(--success-light)',
              borderColor: 'var(--success-light)',
            }}
          >
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--success)' }}>
              <HiOutlineCheckCircle className="text-[16px] shrink-0" />
              <span>{t('quizBank.submittedHint')}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">
                {t('quizBank.yourMark')}:
              </span>
              <span className="text-[20px] font-bold text-primary">
                {attemptResult.score} / {attemptResult.max_score}
              </span>
              {attemptResult.max_score > 0 && (
                <span className="text-[13px] text-secondary">
                  ({Math.round((attemptResult.score / attemptResult.max_score) * 100)}%)
                </span>
              )}
            </div>
            {attemptResult.has_essay && (
              <p className="text-[12px] text-muted italic">
                {t('quizBank.essayPendingReview')}
              </p>
            )}
          </div>
        )} */}

        {submitError && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[13px]"
            style={{
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              border: '1px solid var(--danger-light)',
            }}
          >
            <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
            <span>{submitError}</span>
          </div>
        )}
      </div>

      {tTotalPages > 1 && !submitted && !reviewing && (
        <div className="border-t border-bd">
          <Paginator page={tPage} totalPages={tTotalPages} onPageChange={setTPage} />
        </div>
      )}

      <div className="flex gap-2 justify-end border-t border-bd p-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-[10px] border border-bd bg-transparent text-primary text-[13px] font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
        >
          {submitted ? t('common.close') : t('common.cancel')}
        </button>

        {!submitted && !reviewing && !isLastPage && (
          <button
            type="button"
            onClick={() => setTPage((p) => Math.min(tTotalPages, p + 1))}
            className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none"
          >
            {t('quizBank.next')}
          </button>
        )}

        {!submitted && !reviewing && isLastPage && quiz.questions.length > 0 && (
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none"
          >
            {t('quizBank.reviewAnswers')}
          </button>
        )}

        {!submitted && reviewing && (
          <>
            <button
              type="button"
              onClick={() => {
                setReviewing(false)
                setTPage(1)
              }}
              className="px-4 py-2 rounded-[10px] border border-bd bg-transparent text-primary text-[13px] font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
            >
              {t('quizBank.editAnswers')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                if (
                  unansweredCount > 0 &&
                  !(await confirmDialog({
                    title: t('quizBank.confirmSubmitWithUnanswered'),
                    confirmLabel: 'Submit',
                  }))
                )
                  return
                setSubmitting(true)
                setSubmitError(null)
                try {
                  const payload = quiz.questions.map((q) => {
                    if (q.type === 'multiple_choice')
                      return {
                        question_id: q.id,
                        answer: mcAnswers[q.id] ?? [],
                        text: null as string | null,
                      }
                    if (q.type === 'true_false')
                      return {
                        question_id: q.id,
                        answer: tfAnswers[q.id] ? [tfAnswers[q.id]] : [],
                        text: null as string | null,
                      }
                    return {
                      question_id: q.id,
                      answer: [] as string[],
                      text: (essayAnswers[q.id] ?? '').trim() || null,
                    }
                  })
                  const result = await onSubmit(quiz.id, payload)
                  setAttemptResult(result)
                  setSubmitted(true)
                } catch {
                  setSubmitError(t('quizBank.submitFailed'))
                } finally {
                  setSubmitting(false)
                }
              }}
              className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t('quizBank.submit')}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  )
}