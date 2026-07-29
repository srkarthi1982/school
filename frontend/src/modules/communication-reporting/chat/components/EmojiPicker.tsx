import { useEffect, useState } from 'react'

interface Props {
  onPick: (emoji: string) => void
}

interface Category {
  id: string
  icon: string
  label: string
  emojis: string[]
}

const RECENT_KEY = 'chat-recent-emojis'
const MAX_RECENT = 16

const CATEGORIES: Category[] = [
  {
    id: 'smileys',
    icon: '😀',
    label: 'Smileys',
    emojis: [
      '😀', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😊', '😇',
      '😉', '😍', '🥰', '😘', '😋', '😜', '🤪', '🤗', '🤔', '🤨',
      '😐', '😶', '🙄', '😏', '😴', '🤤', '😪', '😷', '🤒', '🤕',
      '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲',
      '😳', '🥺', '😢', '😭', '😤', '😠', '😡', '🤯', '😱', '😨',
    ],
  },
  {
    id: 'gestures',
    icon: '👍',
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏',
      '💪', '👏', '🙌', '👐', '🤲', '✍️', '💅', '🤳', '🫶', '🫡',
    ],
  },
  {
    id: 'hearts',
    icon: '❤️',
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️',
    ],
  },
  {
    id: 'nature',
    icon: '🌸',
    label: 'Nature',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦋', '🐝',
      '🌸', '🌺', '🌻', '🌹', '🌷', '🌲', '🌴', '🍀', '🌈', '⭐',
      '🌙', '☀️', '⛅', '🌧️', '⛈️', '❄️', '🔥', '💧', '🌊', '✨',
    ],
  },
  {
    id: 'food',
    icon: '🍕',
    label: 'Food',
    emojis: [
      '🍎', '🍌', '🍇', '🍓', '🍉', '🍑', '🥭', '🍍', '🥑', '🍅',
      '🍞', '🥐', '🧀', '🍳', '🥞', '🍗', '🍔', '🍟', '🍕', '🌮',
      '🍜', '🍣', '🍙', '🍦', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬',
      '☕', '🍵', '🥤', '🧃', '🥛', '🍿',
    ],
  },
  {
    id: 'activities',
    icon: '⚽',
    label: 'Activities',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸', '🥅', '🏆',
      '🥇', '🥈', '🥉', '🏅', '🎯', '🎮', '🎲', '🧩', '🎨', '🎭',
      '🎤', '🎧', '🎸', '🎹', '🥁', '🎬', '🎪', '🚴', '🏊', '🧗',
    ],
  },
  {
    id: 'objects',
    icon: '📚',
    label: 'Objects',
    emojis: [
      '📚', '📖', '📝', '✏️', '🖊️', '📏', '📐', '🧮', '🔬', '🔭',
      '🧪', '🎓', '🏫', '💡', '📌', '📎', '✂️', '📅', '⏰', '⌛',
      '💻', '🖥️', '⌨️', '🖱️', '📱', '📷', '🔍', '🔒', '🔑', '🎁',
      '🎉', '🎊', '🎈', '✅', '❌', '❓', '❗', '💯', '🔔', '📣',
    ],
  },
]

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function saveRecent(emoji: string): string[] {
  const next = [emoji, ...loadRecents().filter((e) => e !== emoji)].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures (private mode, quota)
  }
  return next
}

export default function EmojiPicker({ onPick }: Props) {
  const [recents, setRecents] = useState<string[]>([])
  const [activeId, setActiveId] = useState(CATEGORIES[0].id)

  useEffect(() => {
    setRecents(loadRecents())
  }, [])

  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0]

  const pick = (emoji: string) => {
    setRecents(saveRecent(emoji))
    onPick(emoji)
  }

  return (
    <div
      className="absolute bottom-full mb-2 start-0 z-20 w-[300px] rounded-[12px] border shadow-lg overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      role="dialog"
      aria-label="Emoji picker"
    >
      <div
        className="flex items-center gap-0.5 px-2 pt-2 pb-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveId(cat.id)}
            aria-label={cat.label}
            title={cat.label}
            className={`flex-1 rounded-md py-1 text-[15px] transition-colors ${
              cat.id === activeId ? 'bg-black/10' : 'hover:bg-black/5'
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div className="max-h-[210px] overflow-y-auto p-2">
        {recents.length > 0 && (
          <>
            <p className="text-[10.5px] font-medium text-muted mb-1 px-0.5">Recently used</p>
            <div className="grid grid-cols-8 gap-0.5 mb-2">
              {recents.map((emoji) => (
                <button
                  key={`recent-${emoji}`}
                  type="button"
                  onClick={() => pick(emoji)}
                  className="rounded-md p-1 text-[18px] leading-none hover:bg-black/5 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="text-[10.5px] font-medium text-muted mb-1 px-0.5">{active.label}</p>
        <div className="grid grid-cols-8 gap-0.5">
          {active.emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              className="rounded-md p-1 text-[18px] leading-none hover:bg-black/5 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
