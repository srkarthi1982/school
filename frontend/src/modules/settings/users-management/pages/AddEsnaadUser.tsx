import { useState, useCallback } from 'react'
import { HiOutlineExclamationCircle } from 'react-icons/hi2'
import { lookupUserApiV1MilitaryIdLookupUserGet } from '../../../../api/generated'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import type { UserCreate } from '../../../../api/generated'

interface LookupResult {
    email: string
    fullName: string
    dateOfBirth: string | null
    country: string | null
}

function formatDateForUserCreate(dateStr: string): string {
    if (!dateStr) return ''

    // Already ISO datetime format like 1980-01-30T00:00:00
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return dateStr

    // DD MMM YYYY (e.g. "30-JAN-1980" or "30/01/1980")
    const alphaMatch = dateStr.match(/^(\d{1,2})\s*[-/]\s*([A-Za-z]+)\s*[-/]\s*(\d{4})$/)
    if (alphaMatch) {
        const [, d, m, y] = alphaMatch
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
        const monthIdx = months.indexOf(m.toUpperCase())
        if (monthIdx > -1) {
            const month = String(monthIdx + 1).padStart(2, '0')
            return `${y}-${month}-${d.padStart(2, '0')}T00:00:00`
        }
    }

    // DD/MM/YYYY (numeric)
    const numMatch = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
    if (numMatch) {
        const [, d, m, y] = numMatch
        const month = m.padStart(2, '0')
        return `${y}-${month}-${d.padStart(2, '0')}T00:00:00`
    }

    return ''
}

export default function AddEsnaadUser({
    onClose,
    onSubmit,
}: {
    onClose: () => void
    onSubmit: (form: UserCreate) => Promise<void>
}) {
    const [militaryId, setMilitaryId] = useState('')
    const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
    const [footerVisible, setFooterVisible] = useState(false)
    const [lookuping, setLookuping] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const toast = useToast()

    const handleLookup = useCallback(async () => {
        if (!militaryId.trim()) return
        setLookuping(true)
        setError(null)
        setLookupResult(null)
        try {
            const response = await lookupUserApiV1MilitaryIdLookupUserGet({
                path: { military_id: militaryId.trim() },
            })
            const data = (response.data as any)?.data
            if (data?.email && data?.fullName) {
                setLookupResult({
                    email: data.email,
                    fullName: data.fullName,
                    dateOfBirth: data.dateOfBirth ?? null,
                    country: data.country ?? null,
                })
                if(!footerVisible) setFooterVisible(true)
            } else {
                setError('No user found with this Military ID')
            }
        } catch {
            setError('Failed to look up user')
        } finally {
            setLookuping(false)
        }
    }, [militaryId])

    const handleSubmit = useCallback(async () => {
        if (!lookupResult || submitting) return
        setSubmitting(true)
        setError(null)
        try {
            const password = `TempPass${militaryId.slice(-6)}!`
            const form: UserCreate = {
                email: lookupResult.email,
                username: militaryId,
                full_name: lookupResult.fullName,
                roles: [],
                is_active: false,
                password,
                date_of_birth: lookupResult.dateOfBirth ? formatDateForUserCreate(lookupResult.dateOfBirth) : '',
                country: lookupResult.country || '',
            }
            await onSubmit(form)
            toast.success({ title: 'User created successfully' })
            onClose()
        } catch (err: any) {
            setError('Failed to add new user')
        } finally {
            setSubmitting(false)
        }
    }, [lookupResult, submitting, militaryId, onClose, onSubmit, toast])

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[525px] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">Add User from Esnaad</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Military ID */}
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">
                                Military ID
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={militaryId}
                                    onChange={(e) => setMilitaryId(e.target.value)}
                                    placeholder="Enter military ID"
                                    className={inputClass}
                                />
                                <button
                                    type="button"
                                    onClick={handleLookup}
                                    disabled={lookuping || !militaryId.trim()}
                                    className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                >
                                    {lookuping ? 'Looking up…' : 'Check User'}
                                </button>
                            </div>
                        </div>

                        {/* Lookup result */}
                        {(lookupResult || footerVisible) && (
                            <div>
                                <div className={inputClass} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div>
                                            <span className="text-xs text-muted">Full Name</span>
                                            <p className="text-sm text-primary font-medium">{lookupResult?.fullName || '\u00A0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-muted">Email</span>
                                            <p className="text-sm text-primary font-medium">{lookupResult?.email ?? '\u00A0'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
                                <p className="text-sm text-red-500">{error}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer - shown after first successful lookup, stays until panel closes */}
                {footerVisible && (
                    <div className="px-6 py-4 flex items-center justify-end gap-2 border-t border-bd shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={submitting || !lookupResult}
                            onClick={handleSubmit}
                            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Creating…' : 'Add User'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
