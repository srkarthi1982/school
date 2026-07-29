import { ReactNode, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HiOutlineUser, HiOutlineLockClosed } from 'react-icons/hi2'
import useAuthStore, { selectLogin } from './useAuthStore'
import { useI18n } from '../locales/I18nContext'

function ErrorDialogBox({ title, children, onClose, t }: { title: string, children: ReactNode, onClose: () => void, t: any }) {
  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50' onClick={(e) => e.stopPropagation()}>
      <div className='card p-0 overflow-hidden w-[450px]'>
        <div className='px-[14px] py-2.5 flex items-center gap-3' style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}>
          <p className="text-sm font-bold text-white  ">{title}</p>
        </div>
        <div className="flex flex-col gap-6 text-xs px-6 py-5">
          {children}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("auth.understood")}
          </button>
        </div>
      </div>
    </div>
  )
}
export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const login = useAuthStore(selectLogin)
  const navigate = useNavigate()
  const { t, lang, changeLanguage } = useI18n()

  const handleCloseDialog = () => {
    setUsername('')
    setPassword('')
    setRegisterSuccess(false)
  }
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if ("AUTH_SUCCESS" === result) {
        navigate('/')
        return
      }
      setRegisterSuccess(true)
    } catch (err: unknown) {
      // console.log('e', err)
      const ex = err as Record<string, unknown>
      const nested = ex?.error as Record<string, unknown> | undefined
      const msg = nested?.message ?? ex?.detail ?? ex?.message
      setError(typeof msg === 'string' ? msg : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* Lang switcher */}
      <div className="fixed top-4 end-4 flex gap-1.5">
        <button className={`lang-btn${lang === 'en' ? ' active' : ''}`} onClick={() => changeLanguage('en')}>EN</button>
        <button className={`lang-btn${lang === 'ar' ? ' active' : ''}`} onClick={() => changeLanguage('ar')}>AR</button>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm card p-8">
        <img src="/icons/tars-logo-1.png" alt="TARS" className="block mx-auto mb-3" style={{width:'12rem',height:'12rem'}} />
        {/* <p className="text-[13px] text-muted text-center mb-7">
          {lang === 'ar' ? 'أدخل بيانات حسابك للمتابعة' : 'Sign in to your account to continue'}
        </p> */}

        {error && (
          <div className="text-red-600 text-[13px] rounded-xl p-3.5 mb-5 border"
            style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-[0.1em] mb-2">
              {t('auth.username')}
            </label>
            <div className="relative">
              <HiOutlineUser className="absolute top-1/2 -translate-y-1/2 text-[16px] text-muted pointer-events-none"
                style={{ insetInlineStart: 12 }} />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                style={{ paddingInlineStart: 38, paddingInlineEnd: 14 }}
                className="w-full py-2.5 bg-surface-2 border-2 border-transparent rounded-xl text-primary text-[14px] focus:outline-none focus:border-accent transition-[border-color] duration-150"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-[0.1em] mb-2">
              {t('auth.password')}
            </label>
            <div className="relative">
              <HiOutlineLockClosed className="absolute top-1/2 -translate-y-1/2 text-[16px] text-muted pointer-events-none"
                style={{ insetInlineStart: 12 }} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingInlineStart: 38, paddingInlineEnd: 14 }}
                className="w-full py-2.5 bg-surface-2 border-2 border-transparent rounded-xl text-primary text-[14px] focus:outline-none focus:border-accent transition-[border-color] duration-150"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white text-[14px] font-bold border-none cursor-pointer mt-1 hover:opacity-90 transition-opacity disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {loading
              ? (lang === 'ar' ? 'جاري الدخول...' : 'Signing in...')
              : t('auth.login')
            }
          </button>
        </form>

        {/* <p className="text-center mt-5 text-[13px] text-muted">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-accent font-semibold hover:underline">
            {t('auth.register')}
          </Link>
        </p> */}
      </div>
      {registerSuccess && (
        <ErrorDialogBox title={t("auth.loginSuccessTitle")} onClose={handleCloseDialog} t={t}>
          <div className='flex flex-col gap-2'>
            <label>{t("auth.registerSuccess2")}</label>
          </div>
        </ErrorDialogBox>
      )}
    </div>
  )
}

