import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2'

interface PaginatorProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Paginator({ page, totalPages, onPageChange }: PaginatorProps) {
  if (totalPages <= 1) return null

  const btnClass = "inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-bd rounded-lg bg-surface text-secondary hover:bg-accent/10 hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"

  return (
    <div className="flex items-center justify-center gap-4 py-4 text-sm text-muted">
      <button
        className={btnClass}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        <HiChevronLeft className="text-[15px] rtl:rotate-180" />
        Prev
      </button>
      <span className="text-secondary">
        Page <span className="font-semibold text-primary">{page}</span> of {totalPages}
      </span>
      <button
        className={btnClass}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
        <HiChevronRight className="text-[15px] rtl:rotate-180" />
      </button>
    </div>
  )
}
