interface Props {
  title: string
  description: string
}

export default function SectionHeader({ title, description }: Props) {
  return (
    <div className="mb-7">
      <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em] mb-1">{title}</h2>
      <p className="text-[13px] text-muted">{description}</p>
      <div className="h-px bg-[var(--border)] mt-5" />
    </div>
  )
}
