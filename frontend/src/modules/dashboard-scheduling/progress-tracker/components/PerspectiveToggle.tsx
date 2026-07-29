import { HiOutlineUserGroup, HiOutlineUsers } from 'react-icons/hi2'
import useProgressStore from '../store'

export default function PerspectiveToggle() {
  const selectedPerspective = useProgressStore((s) => s.selectedPerspective)
  const setPerspective = useProgressStore((s) => s.setPerspective)

  return (
    <div className="flex items-center gap-2 bg-surface border border-bd rounded-full p-1">
      <button
        onClick={() => setPerspective('student')}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors"
        style={{
          background: selectedPerspective === 'student' ? 'var(--accent)' : 'transparent',
          color: selectedPerspective === 'student' ? '#fff' : 'var(--text-muted)',
        }}
      >
        <HiOutlineUsers className="text-[14px]" /> Student
      </button>
      <button
        onClick={() => setPerspective('other')}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors"
        style={{
          background: selectedPerspective === 'other' ? 'var(--accent)' : 'transparent',
          color: selectedPerspective === 'other' ? '#fff' : 'var(--text-muted)',
        }}
      >
        <HiOutlineUserGroup className="text-[14px]" /> Instructor
      </button>
    </div>
  )
}
