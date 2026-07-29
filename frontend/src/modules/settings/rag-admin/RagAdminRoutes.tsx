import type { ReactNode } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import RagAdminLandingPage from './RagAdminLandingPage'
import { CATEGORIES } from './_shared/types'

function BackLink({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <div className="h-full flex flex-col overflow-auto">
      <button
        type="button"
        onClick={() => navigate('..')}
        className="inline-flex self-start items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px] rtl:rotate-180" />
        {t('ragAdmin.backToRagAdmin')}
      </button>
      {children}
    </div>
  )
}

export default function RagAdminRoutes() {
  return (
    <Routes>
      <Route index element={<RagAdminLandingPage />} />
      {CATEGORIES.map((cat) => (
        <Route
          key={cat.slug}
          path={cat.slug}
          element={
            <BackLink>
              <cat.pageComponent />
            </BackLink>
          }
        />
      ))}
    </Routes>
  )
}
