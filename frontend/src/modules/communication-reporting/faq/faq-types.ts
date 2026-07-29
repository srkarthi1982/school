// FAQ feature — types. Mirrors the backend FaqResponse / FaqCreate schemas.

export type FaqEntry = {
  id: number
  question: string
  answer: string
  created_at: string
  updated_at: string
}

export type FaqInput = {
  question: string
  answer: string
}
