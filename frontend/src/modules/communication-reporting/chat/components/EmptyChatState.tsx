import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2'

interface Props {
  variant: 'list' | 'thread'
  title: string
  hint?: string
}

export default function EmptyChatState({ variant, title, hint }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center text-muted ${
        variant === 'list' ? 'py-10 px-4' : 'h-full p-8'
      }`}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
      >
        <HiOutlineChatBubbleLeftRight className="text-[22px]" />
      </div>
      <p className="text-[13.5px] font-semibold text-primary mb-1">{title}</p>
      {hint && <p className="text-[12px] text-muted max-w-xs">{hint}</p>}
    </div>
  )
}
