interface Props {
  label?: string
}

export default function TypingIndicator({ label }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--text-muted)',
              animation: 'chat-bounce 1.2s infinite ease-in-out',
              animationDelay: `${d}ms`,
            }}
          />
        ))}
      </div>
      {label && <span className="text-[11.5px] text-muted">{label}</span>}
    </div>
  )
}
