import { useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineExclamationCircle, HiOutlinePlus, HiOutlineTrash, HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'

import { Field, ModalFooter, ModalShell } from '../ui/modal-shell'
import Paginator from '../../../../infra/shared/components/Paginator'
import { FormAnswerOption, FormQuestion, FormQuestionType } from '../types/form'
import { useRect } from '@dnd-kit/core/dist/hooks/utilities'
import useToastStore from '../../../../infra/shared/store/useToastStore'

const EXISTING_PAGE_SIZE = 5



// export interface ExistingQuestionEntry {
//   question: QuizQuestion
//   quizId: number
//   quizName: string
// }

interface QuestionFormModalProps {
  mode: 'create' | 'edit'
  initial: FormQuestion | null
  onClose: () => void
  onSubmit: (payload: Omit<FormQuestion, 'id'>,isSavedToFormPool:boolean) => void | Promise<void>
  labelByQuestionType: Record<string, string>
  existingQuestions?: FormQuestion[]
  formPoolQuestions?: FormQuestion[]
}

type FormTab = 'new' | 'existing'
type FormTabPool = 'QuizPool' | 'FormPool'

const buildChoicesFromQuestion = (q: FormQuestion | null) => {

  const seed = q?.options ?? []
  return Array.from({ length: seed.length === 0 ? 4 : seed.length }, (_, i) => seed[i] ?? { id: 0, text: '', weight: 1 })
}
// const buildChoicesFromQuestion = (q: FormQuestion | null, choices?: FormAnswerOption[]) => {
//   const seed = q?.options ?? []

//   return (q === null ? [0, 1, 2, 3] : choices).map((i, idx) => seed[idx] ?? { id: 0, text: '', weight: 1 })
// }

// const buildCorrectFromQuestion = (q: FormQuestion | null) => {
//   const seed = q?.options ?? []
//   const initialAnswers = q?.answers ?? []
//   return [0, 1, 2, 3].map((i) => {
//     const choice = seed[i]
//     return choice ? initialAnswers.includes(choice) : false
//   })
// }

export function QuestionFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
  labelByQuestionType,
  existingQuestions,
  formPoolQuestions
}: QuestionFormModalProps) {
  const { t } = useI18n()
  const showBrowseTab = mode === 'create'
  const [tab, setTab] = useState<FormTab>('new')
  const [tabPool, setTabPool] = useState<FormTabPool>('FormPool')
  const [search, setSearch] = useState('')
  const [searchFormPool, setSearchFormPool] = useState('')
  const [description, setDescription] = useState(initial?.text ?? '')
  const [type, setType] = useState<FormQuestionType>(initial?.type ?? 'multiple')

  const [weight, setWeight] = useState<number>(initial?.weight ?? 1)
  const [choices, setChoices] = useState<FormAnswerOption[]>(() => buildChoicesFromQuestion(initial))
  const [isQuestionRequired, setIsQuestionRequired] = useState<boolean | undefined>(false);
  const [isSavedToFormPool,setIsSavedFormPool]= useState<boolean>(false);
  const [allowMultiple, setIsAllowMultiple] = useState<boolean | undefined>(false)

  // const [choices, setChoices] = useState<FormAnswerOption[]>([])
  // const [correct, setCorrect] = useState<boolean[]>(() => buildCorrectFromQuestion(initial))

  const [essayAnswer, setEssayAnswer] = useState(
    initial?.type === 'text' ? initial.text ?? '' : '',
  )

  // const nexId = useRef(
  //   Math.max(0, ...choices.map(i => i.id)) + 1
  // );

  const [tfAnswer, setTfAnswer] = useState<'true' | 'false' | null>('false')

  const [error, setError] = useState<string | null>(null)
  const [showExisting, setShowExisting] = useState<boolean>(false)
  const [existingId, setExistingId] = useState<number | undefined>()

  const filteredExisting = useMemo(() => {

    if (!existingQuestions) return []
    const q = search.trim().toLowerCase()
    if (!q) return existingQuestions
    return existingQuestions.filter(
      (e) =>
        e.text.toLowerCase().includes(q)
    )
  }, [existingQuestions, search])

  const filteredExistingFormPool = useMemo(() => {

    if (!formPoolQuestions) return []
    const q = search.trim().toLowerCase()
    if (!q) return formPoolQuestions
    return formPoolQuestions.filter(
      (e) =>
        e.text.toLowerCase().includes(q)
    )
  }, [formPoolQuestions, searchFormPool])



  const [existingPage, setExistingPage] = useState(1)
  const [existingPageFormPool, setExistingPageFormPool] = useState(1)
  const existingTotalPages = Math.max(
    1,
    Math.ceil(filteredExisting.length / EXISTING_PAGE_SIZE),
  )

  const existingTotalPagesFormPool = Math.max(
    1,
    Math.ceil(filteredExistingFormPool.length / EXISTING_PAGE_SIZE),
  )

  useEffect(() => {
    setExistingPage(1)
  }, [search, tab])

  useEffect(() => {
    setExistingPage(1)
  }, [searchFormPool, tabPool])


  useEffect(() => {
    if (existingPage > existingTotalPages) setExistingPage(existingTotalPages)
  }, [existingPage, existingTotalPages])

  useEffect(() => {
    if (existingPageFormPool > existingTotalPagesFormPool) setExistingPageFormPool(existingTotalPagesFormPool)
  }, [existingPageFormPool, existingTotalPagesFormPool])


  const pagedExisting = useMemo(
    () =>
      filteredExisting.slice(
        (existingPage - 1) * EXISTING_PAGE_SIZE,
        existingPage * EXISTING_PAGE_SIZE,
      ),
    [filteredExisting, existingPage],
  )

  const pagedExistingFormPool = useMemo(
    () =>
      filteredExistingFormPool.slice(
        (existingPageFormPool - 1) * EXISTING_PAGE_SIZE,
        existingPageFormPool * EXISTING_PAGE_SIZE,
      ),
    [filteredExistingFormPool, existingPageFormPool],
  )

  const useExistingQuestion = (entry: FormQuestion) => {
    const q = entry
    setShowExisting(true)
    setExistingId(q.id)
    setDescription(q.text)
    setType(q.type)

    setWeight(q.weight)
    setChoices(buildChoicesFromQuestion(q))
    setIsAllowMultiple(q.allowMultiple)
    setIsQuestionRequired(q.required)
    //setEssayAnswer(q.type === 'text' ? q.text ?? '' : '')
    // if (q.type === 'true_false') {
    //   const a = q.answers[0]
    //   setTfAnswer(a === 'true' || a === 'false' ? a : null)
    // } else {
    //   setTfAn
    setError(null)
    setTab('new')
  }

  const addChoice = () => {
    setChoices((s) => [...s, { id: 0, text: '', weight: 0 }])

  }
  const removeChoice = (idx: number) => {
    setChoices((s) => s.filter((_, i) => i !== idx))

  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    // if (!description.trim()) {
    //   setError(t('form.errors.required'))
    //   return
    // }
    if (type === 'multiple') {
      
      const seen = new Set()
      let hasDuplicateChoices = false

      for (const item of choices) {
         if(seen.has(item.text.trim())){
          hasDuplicateChoices = true;
          break;
         }
         seen.add(item.text.trim())
      }

      if(hasDuplicateChoices){
        useToastStore.getState().push({ variant: 'warning', title: 'Duplicate choice text' })
        return
      }
      
      onSubmit({
        // existingQuizId: existingId,
        text: description.trim(),
        type,
        weight,
        allowMultiple,
        required: isQuestionRequired,
        options: choices,
        
        // answers: correctChoices,
      },isSavedToFormPool)
    }
     
    else if (type === 'text' || type === 'rating' || type === 'true_false' || type === 'rating_with_text') {
      
      onSubmit({
        existingQuizId: existingId,
        text: description.trim(),
        type,
        weight,
      },isSavedToFormPool)


    }

  }
  const title = mode === 'edit' ? t('form.editQuestion') : t('form.addQuestion')
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
              {t('form.createNewQuestion')}
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
              {t('form.fromExisting')}
            </button>
          </div>
          <br /><br />
          {showBrowseTab && tab === 'existing' &&
            <div
              className="inline-flex p-1 rounded-[10px] border border-bd"
              style={{ background: 'var(--surface-2)' }}
            >
              <button
                type="button"
                onClick={() => setTabPool('FormPool')}
                className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none cursor-pointer transition-colors"
                style={{
                  background: tabPool === 'FormPool' ? 'var(--accent)' : 'transparent',
                  color: tabPool === 'FormPool' ? '#FFFFFF' : 'var(--text-muted)',
                }}
              >
                Form Pool
                {/* {t('form.createNewQuestion')} */}
              </button>
              <button
                type="button"
                onClick={() => setTabPool('QuizPool')}
                className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none cursor-pointer transition-colors"
                style={{
                  background: tabPool === 'QuizPool' ? 'var(--accent)' : 'transparent',
                  color: tabPool === 'QuizPool' ? '#FFFFFF' : 'var(--text-muted)',
                }}
              >
                Quiz Pool
                {/* {t('form.fromExisting')} */}
              </button>
            </div>
          }
          {/* {
            showExisting &&
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', flexDirection: 'row', gap: 5 }}>
              <div style={{ width: '100%' }}></div>
              <input type='checkbox' value={existingId} checked={existingId != null}
                onChange={(e) => {
                  setExistingId(existingId ? undefined : Number(e.target.value))
                }} />
              <span className="text-[12px] font-semibold text-secondary" style={{ whiteSpace: 'nowrap' }}>Use Existing</span>
            </div>
          } */}
        </div>
      )}

      {showBrowseTab && tab === 'existing' && tabPool === 'QuizPool' && (
        <div className="p-6 flex flex-col gap-3 overflow-y-auto thin-scrollbar-light max-h-[60vh]">

          <p className="text-[12px] text-muted -mb-1">{t('form.fromExistingHint')}</p>
          <div className="relative">
            <HiOutlineMagnifyingGlass className="absolute start-3 top-1/2 -translate-y-1/2 text-muted text-[15px] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('form.searchQuestionsPlaceholder')}
              className="w-full ps-9 pe-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
            />
          </div>
          {/* {filteredExisting.length === 0 ? ( */}
          {filteredExisting.length === 0 ? (
            <p className="text-center text-[13px] text-muted py-8">
              {t('form.noMatchingQuestions')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pagedExisting.map((entry) => (
                <li
                  key={`${entry.id}-${entry.id}`}
                  className="rounded-[10px] border border-bd p-3 flex items-start justify-between gap-3"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <div className="min-w-0 flex flex-col gap-1">
                    <p className="text-[13px] text-primary leading-snug line-clamp-2">
                      {entry.text}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="px-1.5 py-0.5 rounded-full font-semibold bg-accent-light text-accent">
                        {labelByQuestionType[entry.type]}
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

      {showBrowseTab && tab === 'existing' && tabPool === 'FormPool' && (
        <div className="p-6 flex flex-col gap-3 overflow-y-auto thin-scrollbar-light max-h-[60vh]">

          <p className="text-[12px] text-muted -mb-1">{t('form.fromExistingFormPoolHint')}</p>
          <div className="relative">
            <HiOutlineMagnifyingGlass className="absolute start-3 top-1/2 -translate-y-1/2 text-muted text-[15px] pointer-events-none" />
            <input
              type="text"
              value={searchFormPool}
              onChange={(e) => setSearchFormPool(e.target.value)}
              placeholder={t('form.searchQuestionsPlaceholder')}
              className="w-full ps-9 pe-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
            />
          </div>

          {filteredExistingFormPool.length === 0 ? (
            <p className="text-center text-[13px] text-muted py-8">
              {t('form.noMatchingQuestions')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pagedExistingFormPool.map((entry) => (
                <li
                  key={`${entry.id}-${entry.id}`}
                  className="rounded-[10px] border border-bd p-3 flex items-start justify-between gap-3"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <div className="min-w-0 flex flex-col gap-1">
                    <p className="text-[13px] text-primary leading-snug line-clamp-2">
                      {entry.text}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="px-1.5 py-0.5 rounded-full font-semibold bg-accent-light text-accent">
                        {labelByQuestionType[entry.type]}
                      </span>
                      {/* <span>
                        {t('quizBank.fromQuiz')}{' '}
                        <strong className="text-secondary">{entry.text}</strong>
                      </span> */}
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
          {existingTotalPagesFormPool > 1 && (
            <Paginator
              page={existingPageFormPool}
              totalPages={existingTotalPagesFormPool}
              onPageChange={setExistingPageFormPool}
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
        <Field label={t('form.isQuestionRequired')} width='25%'>
          <input
            type="checkbox"
            checked={initial?.required}

            onChange={(e) =>
              setIsQuestionRequired(e.target.checked)

            }
            className="w-4 h-4 rounded"
          />
        </Field>
        <div className="flex flex-row gap-2">
          <Field label={t('quizBank.questionType')} width='45%'>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FormQuestionType)}
              className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
            >
              <option value="multiple">{labelByQuestionType.multiple}</option>
              <option value="text">{labelByQuestionType.text}</option>
              <option value="rating">{labelByQuestionType.rating}</option>
              <option value="rating_with_text">{labelByQuestionType.rating_with_text}</option>
              <option value="true_false">{labelByQuestionType.true_false}</option>
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
          {type == 'multiple' && (
            <Field label={t('form.questionAllowMultiple')} width='25%'>
              <input
                type="checkbox"
                checked={initial?.allowMultiple}

                onChange={(e) =>
                  setIsAllowMultiple(e.target.checked)

                }
                className="w-4 h-4 rounded"
              />
            </Field>
          )}
        </div>

        {type === 'multiple' && (
          <Field label={t('quizBank.choicesAndAnswers')}>
            <p className="text-[11.5px] text-muted -mt-1 mb-1">
              {t('quizBank.choicesHint')}
            </p>
            <div className="flex flex-col gap-2">
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-secondary cursor-pointer shrink-0 px-2.5 py-2 rounded-[10px] border border-bd"
                  >
                    {String.fromCharCode(65 + i)}
                  </label>
                  <input
                    type="text"
                    value={c.text}
                    onChange={(e) => {

                      const next = [...choices]
                      next[i].id = i + 1
                      next[i].text = e.target.value
                      setChoices(next)
                    }}
                    placeholder={t('quizBank.choicePlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
                  />
                  {/* <input
                    type="number"
                    value={c.weight}
                    onChange={(e) => {
                      const next = [...choices]
                      next[i].weight = Number(e.target.value)
                      setChoices(next)
                    }}
                    placeholder={t('quizBank.choicePlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
                  /> */}
                  {choices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeChoice(i)}
                      className="p-2 rounded-md hover:bg-surface-2 text-muted hover:text-[#DC2626] transition-colors border-none bg-transparent cursor-pointer shrink-0"
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
        {/* 
        {type === 'text' && (
          <Field label={t('quizBank.answer')}>
            <textarea
              value={essayAnswer}
              onChange={(e) => setEssayAnswer(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent resize-none"
            />
          </Field>
        )} */}

        {/* {type === 'true_false' && (
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
        )} */}
        <Field label={"Save to form pool?"} width='50%'>
          <input
            type="checkbox"
            checked={isSavedToFormPool}

            onChange={(e) =>
              setIsSavedFormPool(e.target.checked)

            }
            className="w-4 h-4 rounded"
          />
        </Field>
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
