import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore, { selectRegister } from './useAuthStore'
import { useI18n } from '../locales/I18nContext'

interface RegisterForm {
  email: string
  username: string
  password: string
  fullName: string
}

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterForm>({ email: '', username: '', password: '', fullName: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const register = useAuthStore(selectRegister)
  const navigate = useNavigate()
  const { t, lang, changeLanguage } = useI18n()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await register(form.email, form.username, form.password, form.fullName)
      setSuccess(t('auth.registerSuccess'))
    } catch (err: unknown) {
      const e = err as Record<string, unknown>
      const nested = e?.error as Record<string, unknown> | undefined
      const msg = nested?.message ?? e?.detail ?? e?.message
      setError(typeof msg === 'string' ? msg : 'Registration failed')
    }
  }

  const update = (field: keyof RegisterForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value })

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      {/* Language switcher � top right */}
      <div className="fixed top-4 end-4 flex gap-1.5">
        <button
          className={`lang-btn${lang === 'en' ? ' active' : ''}`}
          onClick={() => changeLanguage('en')}
        >
          EN
        </button>
        <button
          className={`lang-btn${lang === 'ar' ? ' active' : ''}`}
          onClick={() => changeLanguage('ar')}
        >
          AR
        </button>
      </div>

      <div className="w-full max-w-sm bg-surface rounded-2xl border border-bd shadow-card p-8">
        <h1 className="text-2xl font-bold text-primary text-center mb-6">
          {t('auth.register')}
        </h1>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {success ? (
          <div className="flex flex-col gap-4">
            <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3">
              {success}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-accent text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity border-none cursor-pointer"
            >
              {t('auth.goToLogin')}
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  {t('auth.fullName')}
                </label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={update('fullName')}
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  {t('auth.username')}
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={update('username')}
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={update('password')}
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-accent text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity border-none cursor-pointer mt-1"
              >
                {t('auth.register')}
              </button>
            </form>

            <p className="text-center mt-5 text-sm text-muted">
              {t('auth.hasAccount')}{' '}
              <Link to="/login" className="text-accent font-medium hover:underline">
                {t('auth.login')}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
