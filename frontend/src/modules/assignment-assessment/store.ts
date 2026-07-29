import { create } from 'zustand'

export interface ActiveAssignment {
  id: number
  title: string
  course: string
  dueIn: string
  progress: number
  status: 'not_started' | 'in_progress' | 'almost_done'
}

export interface SubmissionEntry {
  id: number
  title: string
  course: string
  submittedAt: string
  grade: string | null
  status: 'graded' | 'pending' | 'returned'
}

export interface UpcomingTest {
  id: number
  title: string
  course: string
  date: string
  duration: string
  format: 'mcq' | 'essay' | 'mixed' | 'practical'
}

interface AssignmentAssessmentDefaultState {
  activeAssignments: ActiveAssignment[]
  submissions: SubmissionEntry[]
  upcomingTests: UpcomingTest[]
}

const useAssignmentAssessmentDefaultStore = create<AssignmentAssessmentDefaultState>(() => ({
  activeAssignments: [
    { id: 1, title: 'Binary Search Tree Implementation', course: 'CS101',   dueIn: '2 days',  progress: 60,  status: 'in_progress' },
    { id: 2, title: 'Research Paper: Early Islamic Era',  course: 'HIS120',  dueIn: '5 days',  progress: 25,  status: 'in_progress' },
    { id: 3, title: 'Calculus Problem Set 7',             course: 'MATH201', dueIn: '1 week',  progress: 0,   status: 'not_started' },
    { id: 4, title: 'Lab Report: Optics Experiment',      course: 'PHY103',  dueIn: 'Tomorrow', progress: 85,  status: 'almost_done' },
    { id: 5, title: 'Arabic Essay: Modern Poetry',        course: 'ARB110',  dueIn: '10 days', progress: 40,  status: 'in_progress' },
  ],

  submissions: [
    { id: 1, title: 'Midterm Project — Web App',        course: 'CS101',   submittedAt: 'Apr 18, 2026', grade: 'A',   status: 'graded'   },
    { id: 2, title: 'Quiz 3 — Data Structures',          course: 'CS101',   submittedAt: 'Apr 15, 2026', grade: 'B+',  status: 'graded'   },
    { id: 3, title: 'History Timeline Assignment',        course: 'HIS120',  submittedAt: 'Apr 12, 2026', grade: null,  status: 'pending'  },
    { id: 4, title: 'Calculus Problem Set 6',             course: 'MATH201', submittedAt: 'Apr 10, 2026', grade: 'A-',  status: 'returned' },
    { id: 5, title: 'Physics Lab Report — Mechanics',     course: 'PHY103',  submittedAt: 'Apr 8, 2026',  grade: 'A',   status: 'graded'   },
    { id: 6, title: 'Short Story — Arabic',               course: 'ARB110',  submittedAt: 'Apr 5, 2026',  grade: 'B',   status: 'graded'   },
  ],

  upcomingTests: [
    { id: 1, title: 'Mid-term Exam',        course: 'MATH201', date: 'Apr 24',  duration: '90 min',  format: 'mixed'     },
    { id: 2, title: 'Pop Quiz — Chapter 5', course: 'PHY103',  date: 'Apr 29',  duration: '30 min',  format: 'mcq'       },
    { id: 3, title: 'Final Project Review',  course: 'CS101',   date: 'May 4',   duration: '60 min',  format: 'practical' },
    { id: 4, title: 'Essay Exam',            course: 'HIS120',  date: 'May 8',   duration: '120 min', format: 'essay'     },
  ],
}))

export default useAssignmentAssessmentDefaultStore
