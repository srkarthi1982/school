import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
}

export default function LessonHeader({ icon, title }: Props) {
  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-[20px] text-accent">{icon}</span>
        <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em]">{title}</h2>
      </div>
      <div className="h-px bg-[var(--border)] mt-4" />
    </div>
  )
}
