import type {ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import {HiOutlineArrowLeft} from 'react-icons/hi2'
import type {IconType} from 'react-icons'
import SectionHeader from '../../../infra/shared/components/SectionHeader'

interface Props {
  children: ReactNode
  pageTitle: string
  pageDescription: string
  icon?: IconType
}

export default function AccessManagementWrapper({children, pageTitle, pageDescription, icon: Icon}: Props) {
  const navigate = useNavigate()
  return (
    <div className={'h-full flex flex-col overflow-auto'}>
      <button
        onClick={() => navigate('..')}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px]" />
        Back to Access Management
      </button>
      <SectionHeader
        className="mb-4"
        icon={Icon ? <Icon /> : undefined}
        title={pageTitle}
        description={pageDescription}
      />
      {children}
    </div>
  )
}
