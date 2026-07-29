import { create } from 'zustand'
import type { ReactNode } from 'react'
import {
  HiOutlineGlobeAlt,
  HiOutlineCloudArrowDown,
  HiOutlinePhone,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserCircle,
  HiOutlineDocumentCheck,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2'
// import TawasulIcon from '/icons/tawasul.svg?react'


export interface ExternalAppItem {
  id: number
  name: string
  provider: string
  description: string
  url: string
  label: string
  bg: string
  color: string
  icon: string
}

export interface ResourceItem {
  id: number
  title: string
  description: string
  url: string
}

export interface SupportItem {
  id: number
  title: string
  description: string
  url: string
  label: string
  bg: string
  color: string
  icon?: React.ComponentType<{ className?: string }>
}

interface ExternalLinkDefaultState {
  externalApps: ExternalAppItem[]
  resources: ResourceItem[]
  supportLinks: SupportItem[]
}

const useExternalLinkDefaultStore = create<ExternalLinkDefaultState>(() => ({
  externalApps: [
    {
      id: 10,
      name: 'tarasul',
      provider: '',
      description: '',
      url: 'https://tarasultsa.mil.dir/tarasul/',
      label: 'Open Tarasul',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: 'tarasul.svg'
    },
    {
      id: 20,
      name: 'tawasul',
      provider: '',
      description: '',
      url: 'https://external.tawasul.mil.ae/',
      label: 'Open Tawasul',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: 'tawasul.svg'
    },
    {
      id: 30,
      name: 'attendance',
      provider: '',
      description: '',
      url: 'https://mawjood.tawasul.mil.ae/almawjood2/Login',
      label: 'Open Attendance',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: 'attendanceNew.jpg'
    },
    {
      id: 40,
      name: 'basharia',
      provider: '',
      description: '',
      url: 'https://hrms.tawasul.mil.ae:7778/hr/login/login.do',
      label: 'Open Human Resources',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: 'basharia.svg'
    },
    {
      id: 50,
      name: 'esnaad',
      provider: '',
      description: '',
      url: 'https://esnaad.jac.mil.ae',
      label: 'Open Esnaad',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: 'esnaad.svg'
    },
    {
      id: 60,
      name: 'mai',
      provider: '',
      description: '',
      url: 'https://askmai.tawasul.mil.ae/',
      label: 'Open Ask MAI',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: 'mai.svg'
    },

  ],

  resources: [
    {
      id: 1,
      title: 'Student Handbook 2025/2026',
      description: 'School policies, code of conduct, academic calendar, and grading scales for all grades.',
      url: 'https://drive.jaischool.ae/student-handbook-2025.pdf',
    },
    {
      id: 2,
      title: 'IT Support — Setup Guides',
      description: 'Step-by-step instructions for setting up school devices, email accounts, and VPN access.',
      url: 'https://it.jaischool.ae/guides',
    },
    {
      id: 3,
      title: 'Parent Portal FAQ',
      description: 'Frequently asked questions about grade reports, parent-teacher meetings, and payment plans.',
      url: 'https://parents.jaischool.ae/faq',
    },
    {
      id: 4,
      title: 'Library Digital Catalog',
      description: 'Search the school\'s digital library for e-books, research papers, and multimedia resources.',
      url: 'https://library.jaischool.ae',
    },
    {
      id: 5,
      title: 'Career Guidance Resources',
      description: 'University application guides, scholarship databases, and aptitude tests for senior students.',
      url: 'https://careers.jaischool.ae',
    },
  ],

  supportLinks: [
    {
      id: 1,
      title: 'IT Helpdesk',
      description: 'Report technical issues with devices, network, or school software. Average response time: 2 hours.',
      url: 'mailto:it-help@jaischool.ae',
      label: 'it-help@jaischool.ae',
      bg: 'rgba(59,130,246,0.10)',
      color: '#2563EB',
      icon: HiOutlinePhone,
    },
    {
      id: 2,
      title: 'Academic Counseling',
      description: 'Schedule a meeting with your academic counselor for course selection, grade concerns, or study plans.',
      url: 'mailto:counseling@jaischool.ae',
      label: 'counseling@jaischool.ae',
      bg: 'rgba(34,197,94,0.10)',
      color: '#16A34A',
      icon: HiOutlineUserCircle,
    },
    {
      id: 3,
      title: 'Emergency & Safety',
      description: 'Report emergencies, safety concerns, or bullying incidents. Available 24/7 for urgent matters.',
      url: 'tel:+971223456789',
      label: '+971 2 234 5678',
      bg: 'rgba(220,38,38,0.10)',
      color: '#DC2626',
      icon: HiOutlineExclamationCircle,
    },
  ],
}))

export default useExternalLinkDefaultStore
