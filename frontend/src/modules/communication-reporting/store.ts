import { create } from 'zustand'

export interface InboxMessage {
  id: number
  from: string
  initials: string
  avatarColor: string
  subject: string
  preview: string
  timestamp: string
  unread: boolean
}

export interface Announcement {
  id: number
  title: string
  body: string
  author: string
  date: string
  priority: 'normal' | 'high' | 'urgent'
}

export interface ReportRow {
  id: number
  title: string
  period: string
  type: 'weekly' | 'monthly' | 'semester'
  generated: string
}

interface CommunicationReportingDefaultState {
  inbox: InboxMessage[]
  announcements: Announcement[]
  reports: ReportRow[]
  markRead: (id: number) => void
}

const useCommunicationReportingDefaultStore = create<CommunicationReportingDefaultState>((set) => ({
  inbox: [
    {
      id: 1, from: 'Dr. Ahmed Yousef', initials: 'AY', avatarColor: '#2563EB',
      subject: 'Mid-term project feedback available',
      preview: 'Hi Omar, I reviewed your project submission and left detailed notes...',
      timestamp: '2 hours ago', unread: true,
    },
    {
      id: 2, from: 'Academic Office', initials: 'AO', avatarColor: '#7C3AED',
      subject: 'Semester fee reminder',
      preview: 'This is a friendly reminder that the tuition payment for the spring...',
      timestamp: '5 hours ago', unread: true,
    },
    {
      id: 3, from: 'Sara Ali', initials: 'SA', avatarColor: '#D97706',
      subject: 'Study group this Saturday',
      preview: 'A few of us are meeting at the library on Saturday to go over chapters 5-8...',
      timestamp: 'Yesterday', unread: false,
    },
    {
      id: 4, from: 'Library Team', initials: 'LT', avatarColor: '#0D9488',
      subject: 'Book return overdue',
      preview: "The book 'Introduction to Algorithms' is 3 days overdue. Please return...",
      timestamp: '2 days ago', unread: false,
    },
    {
      id: 5, from: 'IT Support', initials: 'IT', avatarColor: '#64748B',
      subject: 'Wi-Fi maintenance window',
      preview: 'Scheduled maintenance this Friday 22:00 – 00:00. Network will be intermittent...',
      timestamp: '3 days ago', unread: false,
    },
  ],

  announcements: [
    {
      id: 1,
      title: 'Eid al-Fitr Holiday Schedule',
      body: 'The school will be closed from May 1 through May 5 for Eid al-Fitr. Classes resume on May 6.',
      author: 'Academic Office',
      date: 'Apr 20, 2026',
      priority: 'high',
    },
    {
      id: 2,
      title: 'Annual Science Fair Registration Open',
      body: 'Registration for the annual science fair is now open. Submit your team proposals before May 10.',
      author: 'Dr. Laith Karimi',
      date: 'Apr 18, 2026',
      priority: 'normal',
    },
    {
      id: 3,
      title: 'Library extended hours during exams',
      body: 'Starting next week, the library will remain open until 23:00 on weekdays through the exam period.',
      author: 'Library Team',
      date: 'Apr 15, 2026',
      priority: 'normal',
    },
    {
      id: 4,
      title: 'Network Maintenance Notice',
      body: 'Campus Wi-Fi will be temporarily unavailable Friday 22:00 – 00:00 for infrastructure upgrades.',
      author: 'IT Support',
      date: 'Apr 14, 2026',
      priority: 'urgent',
    },
  ],

  reports: [
    { id: 1, title: 'Weekly Progress Report',         period: 'Apr 14 – Apr 20', type: 'weekly',   generated: 'Today'        },
    { id: 2, title: 'Attendance Summary — March',      period: 'March 2026',       type: 'monthly',  generated: 'Apr 1, 2026'  },
    { id: 3, title: 'Grade Distribution — Q3',         period: 'Jan – Mar 2026',   type: 'semester', generated: 'Apr 1, 2026'  },
    { id: 4, title: 'Weekly Progress Report',          period: 'Apr 7 – Apr 13',   type: 'weekly',   generated: 'Apr 14, 2026' },
    { id: 5, title: 'Attendance Summary — February',   period: 'February 2026',    type: 'monthly',  generated: 'Mar 1, 2026'  },
  ],

  markRead: (id) =>
    set((s) => ({
      inbox: s.inbox.map((m) => (m.id === id ? { ...m, unread: false } : m)),
    })),
}))

export default useCommunicationReportingDefaultStore
