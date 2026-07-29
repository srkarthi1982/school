import {useEffect, useMemo, useState} from 'react'
import {HiOutlineExclamationCircle} from 'react-icons/hi2'
import {useI18n} from '../../../infra/locales/I18nContext'
import useFaqStore from './faq-store'
import type {FaqEntry} from './faq-types'

type Props = {
    open: boolean
    entry?: FaqEntry
    onClose: () => void
}


export default function FaqItemModal({open, entry, onClose}: Props) {
    const {t} = useI18n()
    const add = useFaqStore((s) => s.add)
    const update = useFaqStore((s) => s.update)

    const [question, setQuestion] = useState(entry?.question ?? '')
    const [answer, setAnswer] = useState(entry?.answer ?? '')
    const [error, setError] = useState<string | null>(null)

    // Reset when modal toggles or switches between create/edit.
    useEffect(() => {
        if (!open) return
        setQuestion(entry?.question ?? '')
        setAnswer(entry?.answer ?? '')
        setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, entry?.id])

    if (!open) return null

    const isEdit = !!entry

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (!question.trim()) {
            setError(t('faq.errors.questionRequired'))
            return
        }
        if (!answer.trim()) {
            setError(t('faq.errors.answerRequired'))
            return
        }
        const input = {question: question.trim(), answer: answer.trim()}
        try {
            if (isEdit) {
                await update(entry!.id, input)
            } else {
                await add(input)
            }
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)'}}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">
                            {isEdit ? t('faq.editFaq') : t('faq.addFaq')}
                        </p>
                        <p className="text-[11px] text-white/50 mt-px">
                            {isEdit ? t('common.updateRecordHint') : t('common.fillFieldsHint')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">
                            {t('faq.question')}
                        </label>
                        <input
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">
                            {t('faq.answer')}
                        </label>
                        <textarea
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            rows={6}
                            className={`${inputClass} resize-y min-h-[120px]`}
                            required
                        />
                    </div>

                    {error && (
                        <div
                            className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                            <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0"/>
                            <p className="text-sm text-red-500">{error}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 border-t border-bd pt-4 mt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                        >
                            {isEdit ? t('common.save') : t('common.create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
