import { useEffect, useState, useRef } from 'react'
import { HiOutlineSparkles } from 'react-icons/hi2'
import PresenceDot from './PresenceDot'
import { getPhotoFromCache, markPhotoError, fetchUserProfilePhoto } from '../chat-api'

interface Props {
  userId: number | null | undefined
  name: string
  size?: number
  online?: boolean | undefined
  isAgent?: boolean
  avatarUrl?: string | null
}

const PALETTE = [
  '#2563EB', '#7C3AED', '#D97706', '#0D9488', '#DC2626',
  '#0EA5E9', '#9333EA', '#65A30D', '#EA580C', '#06555C',
]

function pickColor(id: number): string {
  return PALETTE[Math.abs(id) % PALETTE.length]
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ userId, name, size = 36, online, isAgent, avatarUrl }: Props) {
  if (isAgent) {
    const fontSize = Math.round(size * 0.5)
    return (
      <div
        className="relative shrink-0 rounded-full flex items-center justify-center text-white"
        style={{ width: size, height: size, background: 'var(--accent)' }}
        aria-label={`${name} (AI assistant)`}
      >
        <HiOutlineSparkles style={{ fontSize }} />
      </div>
    )
  }

  const fontSize = Math.round(size * 0.34)
  const fetchRef = useRef(false)
  const [displayUrl, setDisplayUrl] = useState<string | null>(avatarUrl ?? null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (avatarUrl) {
      setDisplayUrl(avatarUrl)
      setImgError(false)
      return
    }
    if (userId == null || fetchRef.current) return
    fetchRef.current = true

    const cached = getPhotoFromCache(userId)
    if (cached && cached !== 'error') {
      setDisplayUrl(cached)
      return
    }
    if (cached === 'error') return

    fetchUserProfilePhoto(userId).then((result) => {
      const photo = getPhotoFromCache(userId)
      if (photo && photo !== 'error') {
        setDisplayUrl(photo)
      }
    })
  }, [userId, avatarUrl])

  useEffect(() => {
    if (avatarUrl) {
      setDisplayUrl(avatarUrl)
      setImgError(false)
    }
  }, [avatarUrl])

  return (
    <div className="relative shrink-0 rounded-full overflow-hidden" style={{ width: size, height: size }}>
      {displayUrl && !imgError ? (
        <img
          src={displayUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => {
            setImgError(true)
            if (userId != null) {
              markPhotoError(userId)
            }
          }}
        />
      ) : (
        <div
          className="relative shrink-0 flex items-center justify-center font-bold text-white"
          style={{
            width: size,
            height: size,
            background: pickColor(userId ?? 0),
            fontSize: `${fontSize}px`,
          }}
        >
          {initialsFor(name)}
        </div>
      )}
      {typeof online === 'boolean' && <PresenceDot online={online} size={Math.max(8, Math.round(size * 0.26))} />}
    </div>
  )
}
