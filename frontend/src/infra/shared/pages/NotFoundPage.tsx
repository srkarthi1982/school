import { useNavigate } from 'react-router-dom'
import { HiOutlineMapPin } from 'react-icons/hi2'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg px-6">
      <HiOutlineMapPin className="text-[64px] text-muted mb-6" />
      <h1 className="text-2xl font-bold text-primary mb-2">404 — Page Not Found</h1>
      <p className="text-secondary text-sm text-center max-w-sm mb-8">
        The page you are looking for does not exist or has been moved.
      </p>
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold py-2 px-5 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer"
      >
        Back to Home
      </button>
    </div>
  )
}
