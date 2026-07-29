import { Route, Routes } from 'react-router-dom'
import CoursePickerPage from './course-pick/CoursePickerPage'
import QuizGradingPage from './quiz/QuizGradingPage'
import SurveyGradingPage from './survey/SurveyGradingPage'
import FormGradingPage from './form/FormGradingPage'
import FlightPackPage from './flight-pack/FlightPackPage'
import GradingPage from './GradingPage'

export default function GradingRoutes() {
  return (
    <Routes>
      <Route index element={<GradingPage />} />
      <Route path="course-pick/:courseId/quiz/:studentId" element={<QuizGradingPage />} />
      <Route path="course-pick/:courseId/survey/:studentId" element={<SurveyGradingPage />} />
      <Route path="course-pick/:courseId/form/:studentId" element={<FormGradingPage />} />
      <Route path="course-pick/:courseId/flight-pack" element={<FlightPackPage />} />
      <Route path="course-pick/:courseId" element={<CoursePickerPage />} />
    </Routes>
  )
}
