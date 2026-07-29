import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import QuizBankPage from './QuizBankPage'

const manifest: FeatureManifest = {
  i18n: 'nav.quizBank',
  path: 'quiz-bank',
  page: QuizBankPage,
  order: 10,
  permissions: ["quiz:*"],
}
export default manifest
