import { useState } from 'react'
import { HiOutlineExclamationCircle } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { Quiz, QuizType } from '../store'
import { Field, ModalFooter, ModalShell } from '../ui/modal-shell'

interface QuizFormModalProps {
  mode: 'create' | 'edit'
  initial: Quiz | null
  onClose: () => void
  onSubmit: (payload: { name: string; type: QuizType; description: string; weight: number; }) => void | Promise<void>
  labelByQuizType: Record<QuizType, string>
}

export function QuizFormModal({ mode, initial, onClose, onSubmit, labelByQuizType }: QuizFormModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<QuizType>(initial?.type ?? 'multiple_choice')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [weight, setWeight] = useState<number>(initial?.weight ?? 10)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !description.trim()) {
      setError(t('quizBank.errors.required'))
      return
    }
    onSubmit({ name: name.trim(), type, description: description.trim(), weight })
  }

  const title = mode === 'edit' ? t('quizBank.editQuiz') : t('quizBank.createQuiz')
  const hint = mode === 'edit' ? t('common.updateRecordHint') : t('common.fillFieldsHint')
  const submitLabel = mode === 'edit' ? t('common.save') : t('common.create')

  return (
    <ModalShell title={title} hint={hint} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        <Field label={t('quizBank.quizName')}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
          />
        </Field>       
        <Field label={t('quizBank.quizDescription')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent resize-none"
          />
        </Field>
        <Field label={t('quizBank.quizWeight')}>
          <input
            type="number"
            min={0}
            max={100}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
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