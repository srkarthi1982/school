interface Props {
  online: boolean
  size?: number
}

export default function PresenceDot({ online, size = 9 }: Props) {
  return (
    <span
      aria-label={online ? 'online' : 'offline'}
      className="absolute bottom-0 end-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: online ? '#10B981' : '#94A3B8',
        border: '2px solid var(--surface)',
      }}
    />
  )
}
