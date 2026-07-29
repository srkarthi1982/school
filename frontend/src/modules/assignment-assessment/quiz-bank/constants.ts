import type { QuizType, QuestionType, ValidationStatus, Difficulty, QuizQuestion } from './store'

export const PAGE_SIZE = 6
export const QUESTION_PAGE_SIZE = 5
export const TAKE_QUIZ_PAGE_SIZE = 3

export type ViewRole = 'teacher' | 'student' | 'admin'

export const STATUS_COLORS: Record<ValidationStatus, { bg: string; text: string }> = {
  pending: { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  approved: { bg: 'rgba(34,197,94,0.10)', text: '#16A34A' },
  rejected: { bg: 'rgba(220,38,38,0.10)', text: '#DC2626' },
}

export const TYPE_COLORS: Record<QuizType, { bg: string; text: string }> = {
  multiple_choice: { bg: 'rgba(59,130,246,0.10)', text: '#2563EB' },
  essay: { bg: 'rgba(147,51,234,0.10)', text: '#7C3AED' },
  mixed: { bg: 'rgba(6,85,92,0.12)', text: 'var(--accent)' },
  true_false: { bg: '#28a745', text: '#ffffff' }, // 👈 Add this line
}

export const VIEW_ROLES: ViewRole[] = ['teacher', 'student', 'admin']

export function pickInitialView(role: string | null): ViewRole {
  if (role === 'student' || role === 'teacher' || role === 'admin') return role as ViewRole
  return 'teacher'
}

export const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; text: string }> = {
  easy: { bg: 'rgba(34,197,94,0.10)', text: '#16A34A' },
  medium: { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  difficult: { bg: 'rgba(220,38,38,0.10)', text: '#DC2626' },
}

const DIFFICULTY_SCORE: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  difficult: 3,
}

export function averageDifficulty(questions: QuizQuestion[]): Difficulty | null {
  if (questions.length === 0) return null
  const total = questions.reduce((sum, q) => sum + DIFFICULTY_SCORE[q.difficulty], 0)
  const avg = total / questions.length
  if (avg < 1.67) return 'easy'
  if (avg < 2.34) return 'medium'
  return 'difficult'
}