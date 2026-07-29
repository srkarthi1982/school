import { create } from 'zustand'

export interface ScheduleItem {
  id: number
  time: string
  subject: string
  room: string
  teacher: string
  accent: 'teal' | 'blue' | 'amber' | 'purple'
}

export interface UpcomingEvent {
  id: number
  day: string
  date: string
  title: string
  type: 'exam' | 'assignment' | 'meeting' | 'holiday'
}

export interface WeekSlot {
  day: string
  slot1: string | null
  slot2: string | null
  slot3: string | null
}

interface DashboardSchedulingDefaultState {
  todaySchedule: ScheduleItem[]
  weeklyGrid: WeekSlot[]
  upcomingEvents: UpcomingEvent[]
  dateLabel: string
}

const useDashboardSchedulingDefaultStore = create<DashboardSchedulingDefaultState>(() => ({
  dateLabel: 'Wednesday, April 22',

  todaySchedule: [
    { id: 1, time: '08:00 – 08:50', subject: 'Computer Science',  room: 'Lab B-204', teacher: 'Dr. Ahmed Yousef',  accent: 'teal'   },
    { id: 2, time: '09:00 – 09:50', subject: 'Mathematics',       room: 'Room 302',  teacher: 'Mrs. Sara Ali',     accent: 'blue'   },
    { id: 3, time: '10:10 – 11:00', subject: 'Arabic Language',   room: 'Room 115',  teacher: 'Mr. Karim Hassan',  accent: 'purple' },
    { id: 4, time: '11:10 – 12:00', subject: 'Physics',           room: 'Lab A-108', teacher: 'Dr. Laith Karimi',  accent: 'amber'  },
    { id: 5, time: '13:00 – 13:50', subject: 'History',           room: 'Room 218',  teacher: 'Mrs. Rania Mustafa', accent: 'blue'  },
  ],

  weeklyGrid: [
    { day: 'Mon', slot1: 'CS',   slot2: 'Math', slot3: 'Arabic' },
    { day: 'Tue', slot1: 'Hist', slot2: 'Phys', slot3: null      },
    { day: 'Wed', slot1: 'CS',   slot2: 'Math', slot3: 'Arabic' },
    { day: 'Thu', slot1: 'Phys', slot2: null,   slot3: 'Hist'   },
    { day: 'Fri', slot1: 'Math', slot2: 'CS',   slot3: null      },
    { day: 'Sat', slot1: null,   slot2: null,   slot3: null      },
    { day: 'Sun', slot1: null,   slot2: null,   slot3: null      },
  ],

  upcomingEvents: [
    { id: 1, day: 'THU', date: '24', title: 'Mid-term Exam — Mathematics',    type: 'exam'       },
    { id: 2, day: 'FRI', date: '25', title: 'CS Project Submission Due',      type: 'assignment' },
    { id: 3, day: 'MON', date: '28', title: 'Parent-Teacher Meeting',          type: 'meeting'    },
    { id: 4, day: 'TUE', date: '29', title: 'Physics Quiz',                    type: 'exam'       },
    { id: 5, day: 'THU', date: '01', title: 'Eid al-Fitr Holiday',             type: 'holiday'    },
  ],
}))

export default useDashboardSchedulingDefaultStore
