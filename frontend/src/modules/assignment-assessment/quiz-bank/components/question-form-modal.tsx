import { useEffect, useMemo, useState } from 'react'
import { HiOutlineExclamationCircle, HiOutlinePlus, HiOutlineTrash, HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { QuizQuestion, QuestionType, Difficulty } from '../store'
import { Field, ModalFooter, ModalShell } from '../ui/modal-shell'
import Paginator from '../../../../infra/shared/components/Paginator'

const EXISTING_PAGE_SIZE = 5

export interface ExistingQuestionEntry {
  question: QuizQuestion
  quizId: number
  quizName: string
}

interface QuestionFormModalProps {
  mode: 'create' | 'edit'
  initial: QuizQuestion | null
  onClose: () => void
  onSubmit: (payload: Omit<QuizQuestion, 'id'>) => void | Promise<void>
  labelByQuestionType: Record<string, string>
  existingQuestions?: ExistingQuestionEntry[]
}

type FormTab = 'new' | 'existing'

const buildChoicesFromQuestion = (q: QuizQuestion | null) => {
  const seed = q?.choices ?? []
  return [0, 1, 2, 3].map((i) => seed[i] ?? '')
}

const buildCorrectFromQuestion = (q: QuizQuestion | null) => {
  const seed = q?.choices ?? []
  const initialAnswers = q?.answers ?? []
  return [0, 1, 2, 3].map((i) => {
    const choice = seed[i]
    return choice ? initialAnswers.includes(choice) : false
  })
}

export function QuestionFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
  labelByQuestionType,
  existingQuestions,
}: QuestionFormModalProps) {
  const { t } = useI18n()
  const showBrowseTab = mode === 'create'
  const [tab, setTab] = useState<FormTab>('new')
  const [search, setSearch] = useState('')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'multiple_choice')
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'medium')
  const [weight, setWeight] = useState<number>(initial?.weight ?? 1)
  const [choices, setChoices] = useState<string[]>(() => buildChoicesFromQuestion(initial))
  const [correct, setCorrect] = useState<boolean[]>(() => buildCorrectFromQuestion(initial))
  const [essayAnswer, setEssayAnswer] = useState(
    initial?.type === 'essay' ? initial.answers[0] ?? '' : '',
  )
  const [tfAnswer, setTfAnswer] = useState<'true' | 'false' | null>(() => {
    if (initial?.type !== 'true_false') return null
    const a = initial.answers[0]
    return a === 'true' || a === 'false' ? a : null
  })
  const [error, setError] = useState<string | null>(null)
  const [showExisting, setShowExisting] = useState<boolean>(false)  
  const [existingId, setExistingId] = useState<number|undefined>()

  const filteredExisting = useMemo(() => {
    if (!existingQuestions) return []
    const q = search.trim().toLowerCase()
    if (!q) return existingQuestions
    return existingQuestions.filter(
      (e) =>
        e.question.description.toLowerCase().includes(q) ||
        e.quizName.toLowerCase().includes(q),
    )
  }, [existingQuestions, search])

  const [existingPage, setExistingPage] = useState(1)
  const existingTotalPages = Math.max(
    1,
    Math.ceil(filteredExisting.length / EXISTING_PAGE_SIZE),
  )
  useEffect(() => {
    setExistingPage(1)
  }, [search, tab])
  useEffect(() => {
    if (existingPage > existingTotalPages) setExistingPage(existingTotalPages)
  }, [existingPage, existingTotalPages])
  const pagedExisting = useMemo(
    () =>
      filteredExisting.slice(
        (existingPage - 1) * EXISTING_PAGE_SIZE,
        existingPage * EXISTING_PAGE_SIZE,
      ),
    [filteredExisting, existingPage],
  )

  const useExistingQuestion = (entry: ExistingQuestionEntry) => {
    const q = entry.question
    setShowExisting(true)
    setExistingId(q.id)
    setDescription(q.description)
    setType(q.type)
    setDifficulty(q.difficulty)
    setWeight(q.weight)
    setChoices(buildChoicesFromQuestion(q))
    setCorrect(buildCorrectFromQuestion(q))
    setEssayAnswer(q.type === 'essay' ? q.answers[0] ?? '' : '')
    if (q.type === 'true_false') {
      const a = q.answers[0]
      setTfAnswer(a === 'true' || a === 'false' ? a : null)
    } else {
      setTfAnswer(null)
    }
    setError(null)
    setTab('new')
  }

  const addChoice = () => {
    setChoices((s) => [...s, ''])
    setCorrect((s) => [...s, false])
  }
  const removeChoice = (idx: number) => {
    setChoices((s) => s.filter((_, i) => i !== idx))
    setCorrect((s) => s.filter((_, i) => i !== idx))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!description.trim()) {
      setError(t('quizBank.errors.required'))
      return
    }
    if (type === 'multiple_choice') {
      const trimmed = choices.map((c) => c.trim())
      const filledIdx = trimmed
        .map((c, i) => (c ? i : -1))
        .filter((i) => i >= 0)
      if (filledIdx.length < 2) {
        setError(t('quizBank.errors.minChoices'))
        return
      }
      const correctChoices = filledIdx.filter((i) => correct[i]).map((i) => trimmed[i])
      if (correctChoices.length < 1) {
        setError(t('quizBank.errors.minCorrect'))
        return
      }
      onSubmit({
        existingQuizId: existingId,
        description: description.trim(),
        type,
        difficulty,
        weight,
        choices: filledIdx.map((i) => trimmed[i]),
        answers: correctChoices,
      })
    } else if (type === 'true_false') {
      if (tfAnswer !== 'true' && tfAnswer !== 'false') {
        setError(t('quizBank.errors.minCorrect'))
        return
      }
      onSubmit({
        existingQuizId: existingId,
        description: description.trim(),
        type,
        difficulty,
        weight,
        answers: [tfAnswer],
      })
    } else {
      if (!essayAnswer.trim()) {
        setError(t('quizBank.errors.required'))
        return
      }
      onSubmit({
        existingQuizId: existingId,
        description: description.trim(),
        type,
        difficulty,
        weight,
        answers: [essayAnswer.trim()],
      })
    }
  }

  const title = mode === 'edit' ? t('quizBank.editQuestion') : t('quizBank.addQuestion')
  const hint = mode === 'edit' ? t('common.updateRecordHint') : t('common.fillFieldsHint')
  const submitLabel = mode === 'edit' ? t('common.save') : t('common.create')

  return (
    <ModalShell title={title} hint={hint} onClose={onClose}>
      {showBrowseTab && (
        <div className="px-6 pt-4">
          <div
            className="inline-flex p-1 rounded-[10px] border border-bd"
            style={{ background: 'var(--surface-2)' }}
          >
            <button
              type="button"
              onClick={() => setTab('new')}
              className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none cursor-pointer transition-colors"
              style={{
                background: tab === 'new' ? 'var(--accent)' : 'transparent',
                color: tab === 'new' ? '#FFFFFF' : 'var(--text-muted)',
              }}
            >
              {t('quizBank.createNewQuestion')}
            </button>
            <button
              type="button"
              onClick={() => setTab('existing')}
              className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none cursor-pointer transition-colors"
              style={{
                background: tab === 'existing' ? 'var(--accent)' : 'transparent',
                color: tab === 'existing' ? '#FFFFFF' : 'var(--text-muted)',
              }}
            >
              {t('quizBank.fromExisting')}
            </button>
          </div>
          {
            showExisting &&
            <div style={{display:'flex', width:'100%', alignItems:'center', flexDirection:'row', gap:5}}>            
                <div style={{width:'100%'}}></div>
                <input type='checkbox' value={existingId} checked={existingId != null} 
                  onChange={(e) => {
                    setExistingId(existingId ? undefined : Number(e.target.value))
                }}/>
                <span className="text-[12px] font-semibold text-secondary" style={{whiteSpace:'nowrap'}}>Use Existing</span>                   
            </div>
          }          
        </div>
      )}

      {showBrowseTab && tab === 'existing' && (
        <div className="p-6 flex flex-col gap-3 overflow-y-auto thin-scrollbar-light max-h-[60vh]">
          <p className="text-[12px] text-muted -mb-1">{t('quizBank.fromExistingHint')}</p>
          <div className="relative">
            <HiOutlineMagnifyingGlass className="absolute start-3 top-1/2 -translate-y-1/2 text-muted text-[15px] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('quizBank.searchQuestionsPlaceholder')}
              className="w-full ps-9 pe-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
            />
          </div>
          {filteredExisting.length === 0 ? (
            <p className="text-center text-[13px] text-muted py-8">
              {t('quizBank.noMatchingQuestions')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pagedExisting.map((entry) => (
                <li
                  key={`${entry.quizId}-${entry.question.id}`}
                  className="rounded-[10px] border border-bd p-3 flex items-start justify-between gap-3"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <div className="min-w-0 flex flex-col gap-1">
                    <p className="text-[13px] text-primary leading-snug line-clamp-2">
                      {entry.question.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="px-1.5 py-0.5 rounded-full font-semibold bg-accent-light text-accent">
                        {labelByQuestionType[entry.question.type]}
                      </span>
                      <span>
                        {t('quizBank.fromQuiz')}{' '}
                        <strong className="text-secondary">{entry.quizName}</strong>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => useExistingQuestion(entry)}
                    className="shrink-0 inline-flex items-center gap-1 bg-accent text-white text-[12px] font-semibold py-1.5 px-2.5 rounded-[8px] hover:opacity-90 transition-opacity border-none cursor-pointer"
                  >
                    <HiOutlinePlus className="text-[13px]" />
                    {t('quizBank.useThisQuestion')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {existingTotalPages > 1 && (
            <Paginator
              page={existingPage}
              totalPages={existingTotalPages}
              onPageChange={setExistingPage}
            />
          )}
          <div className="flex gap-2 justify-end border-t border-bd pt-4 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[10px] border border-bd bg-transparent text-primary text-[13px] font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-6 flex flex-col gap-4 overflow-y-auto thin-scrollbar-light"
        style={showBrowseTab && tab === 'existing' ? { display: 'none' } : undefined}
      >
        <Field label={t('quizBank.questionDescription')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent resize-none"
          />
        </Field>
        <div className="flex flex-row gap-2">
          <Field label={t('quizBank.questionType')} width='45%'>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
            >
              <option value="multiple_choice">{labelByQuestionType.multiple_choice}</option>
              <option value="essay">{labelByQuestionType.essay}</option>
              <option value="true_false">{labelByQuestionType.true_false}</option>
            </select>
          </Field>
          <Field label={t('quizBank.difficulty')} width='35%'>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"              
            >
              <option value="easy">{t('quizBank.difficulties.easy')}</option>
              <option value="medium">{t('quizBank.difficulties.medium')}</option>
              <option value="difficult">{t('quizBank.difficulties.difficult')}</option>
            </select>
          </Field>
          <Field label={t('quizBank.questionWeight')} width='25%'>
            <input
              type="number"
              min={0}
              step={1}
              value={weight}
              onChange={(e) =>
                setWeight(Math.max(0, Math.floor(Number(e.target.value) || 0)))
              }
              className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"              
            />
          </Field>
        </div>

        {type === 'multiple_choice' && (
          <Field label={t('quizBank.choicesAndAnswers')}>
            <p className="text-[11.5px] text-muted -mt-1 mb-1">
              {t('quizBank.choicesHint')}
            </p>
            <div className="flex flex-col gap-2">
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-secondary cursor-pointer shrink-0 px-2.5 py-2 rounded-[10px] border border-bd"
                    style={{
                      background: correct[i] ? 'var(--accent-light)' : 'var(--surface-2)',
                      color: correct[i] ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={correct[i] ?? false}
                      onChange={(e) => {
                        const next = [...correct]
                        next[i] = e.target.checked
                        setCorrect(next)
                      }}
                      className="accent-[var(--accent)]"
                    />
                    {String.fromCharCode(65 + i)}
                  </label>
                  <input
                    type="text"
                    value={c}
                    onChange={(e) => {
                      const next = [...choices]
                      next[i] = e.target.value
                      setChoices(next)
                    }}
                    placeholder={t('quizBank.choicePlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
                  />
                  {choices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeChoice(i)}
                      className="p-2 rounded-md hover:bg-surface-2 text-muted hover:text-[var(--danger)] transition-colors border-none bg-transparent cursor-pointer shrink-0"
                      aria-label={t('quizBank.removeChoice')}
                    >
                      <HiOutlineTrash className="text-[14px]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addChoice}
              className="self-start mt-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-dashed border-bd text-[12px] font-semibold text-accent bg-transparent hover:bg-accent-light transition-colors cursor-pointer"
            >
              <HiOutlinePlus className="text-[13px]" />
              {t('quizBank.addChoice')}
            </button>
          </Field>
        )}

        {type === 'essay' && (
          <Field label={t('quizBank.answer')}>
            <textarea
              value={essayAnswer}
              onChange={(e) => setEssayAnswer(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent resize-none"
            />
          </Field>
        )}

        {type === 'true_false' && (
          <Field label={t('quizBank.correctAnswer')}>
            <div className="flex gap-2">
              {(['true', 'false'] as const).map((v) => {
                const active = tfAnswer === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTfAnswer(v)}
                    className="flex-1 px-3 py-2 rounded-[10px] border text-[13px] font-semibold cursor-pointer transition-colors"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--surface-2)',
                      color: active ? '#FFFFFF' : 'var(--text-muted)',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {v === 'true' ? t('quizBank.true') : t('quizBank.false')}
                  </button>
                )
              })}
            </div>
          </Field>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <ModalFooter onClose={onClose} submitLabel={submitLabel} />
      </form>
    </ModalShell>
  )
}