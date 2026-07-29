import { useLocation, useNavigate } from 'react-router-dom'
import { HiOutlineShieldExclamation } from 'react-icons/hi2'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // The guard/redirect passes the permission(s) that would have granted access.
  // Since access checks are OR, the user is missing ALL of these.
  const required = (location.state as { required?: string[] } | null)?.required ?? []

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-6">
      <HiOutlineShieldExclamation className="text-[64px] text-muted mb-6" />
      <h1 className="text-2xl font-bold text-primary mb-2">Access Denied</h1>
      <p className="text-secondary text-sm text-center max-w-sm mb-6">
        You do not have permission to view this page. Contact your administrator if you believe this is a mistake.
      </p>

      {required.length > 0 && (
        <div className="mb-8 flex flex-col items-center gap-2 max-w-md">
          <p className="text-[12px] text-muted">
            {required.length > 1
              ? 'Requires at least one of these permissions:'
              : 'Requires this permission:'}
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {required.map((p) => (
              <code
                key={p}
                className="text-[11.5px] font-mono px-2 py-1 rounded-[6px] bg-surface-2 border border-bd text-primary"
              >
                {p}
              </code>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold py-2 px-5 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer"
      >
        Go Back
      </button>
    </div>
  )
}
