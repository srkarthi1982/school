import type {ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import {HiOutlineChevronRight, HiOutlineShieldCheck} from 'react-icons/hi2'
import type {CategorySlug} from './_shared/types'
import {CATEGORIES} from './_shared/types'
import SectionHeader from '../../../infra/shared/components/SectionHeader'

export default function AccessManagementPage() {
  const navigate = useNavigate()
  const scopeLabel = 'Access Management'

  return (
    <div className="flex flex-col gap-4 lg:min-h-0">
      <SectionHeader
        icon={<HiOutlineShieldCheck />}
        title={scopeLabel}
        description="Manage user permissions by assigning roles, configuring granular access controls, and creating custom roles for your organization."
      />

      <div
        className="grid gap-3 lg:flex-1 lg:min-h-0 lg:auto-rows-[minmax(160px,1fr)] overflow-auto thin-scrollbar-light content-start"
        style={{gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'}}
      >
        {CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.slug}
            icon={<cat.icon />}
            label={cat.label}
            description={cat.pageDescription}
            onClick={() => navigate(cat.slug)}
          />
        ))}
      </div>
    </div>
  )
}

function CategoryCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card group flex flex-col items-start text-start gap-3 px-5 py-5 cursor-pointer font-sans hover:border-[var(--accent)] transition-colors"
    >
      <span
        className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0"
        style={{background: 'var(--accent-light)', color: 'var(--accent)'}}
      >
        {icon}
      </span>
      <span className="flex-1">
        <p className="text-[14px] font-bold text-primary">{label}</p>
        <p className="text-[12.5px] text-secondary mt-1 leading-relaxed">{description}</p>
      </span>
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
        Open <HiOutlineChevronRight className="text-[14px] group-hover:translate-x-0.5 transition-transform" />
      </span>
    </button>
  )
}

export type {CategorySlug}
