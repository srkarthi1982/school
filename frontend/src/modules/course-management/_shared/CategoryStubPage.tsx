import {useNavigate, useParams} from 'react-router-dom'
import {HiOutlineArrowLeft, HiOutlineWrenchScrewdriver} from 'react-icons/hi2'
import {CATEGORIES, type CategorySlug} from './types'

interface Props {
  // Path back to the detail page (e.g. /course-management/course-builder/123).
  detailPath: string
  scopeLabel: string
}

export default function CategoryStubPage({detailPath, scopeLabel}: Props) {
  const {category} = useParams<{category: CategorySlug}>()
  const navigate = useNavigate()
  const def = CATEGORIES.find((c) => c.slug === category)

  return (
    <div className="px-6 py-4">
      <button
        onClick={() => navigate(detailPath)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px]" />
        Back to {scopeLabel}
      </button>

      <div className="card p-10 flex flex-col items-center text-center gap-3 max-w-2xl">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{background: 'rgba(6,85,92,0.10)', color: 'var(--accent)'}}
        >
          <HiOutlineWrenchScrewdriver className="text-[24px]" />
        </div>
        <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase">{scopeLabel}</p>
        <h2 className="text-[18px] font-bold text-primary">
          {def?.label ?? 'Category'} — Coming Soon
        </h2>
        <p className="text-[13px] text-secondary max-w-md">
          Detail screens for this category are not implemented yet. Once available, this is where
          you will populate the content needed to bring this category to 100% completion.
        </p>
      </div>
    </div>
  )
}
