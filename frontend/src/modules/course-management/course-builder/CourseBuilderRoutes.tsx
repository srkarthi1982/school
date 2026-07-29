import {Route, Routes, useParams} from 'react-router-dom'
import CategoryStubPage from '../_shared/CategoryStubPage'
import CourseBuilderDetailPage from './CourseBuilderDetailPage'
import CourseBuilderListPage from './CourseBuilderListPage'
import CourseBuilderCourseInfoPage from './CourseBuilderCourseInfoPage'
import CourseBuilderMaterialPage from '../material/CourseBuilderMaterialPage'
import CourseBuilderMaterialFilesPage from '../material/CourseBuilderMaterialFilesPage'
import CourseBuilderMaterialLessonPage from '../material/CourseBuilderMaterialLessonPage'
import CourseBuilderEvaluationPage from '../evaluation/CourseBuilderEvaluationPage'
import CourseBuilderEvaluationAllPage from '../evaluation/CourseBuilderEvaluationAllPage'
import CourseBuilderEvaluationLessonPage from '../evaluation/CourseBuilderEvaluationLessonPage'
import CourseBuilderFormBuilderPage from '../survey/CourseBuilderFormBuilderPage'
import CourseBuilderFormBuilderAllPage from '../survey/CourseBuilderFormBuilderAllPage'
import CourseBuilderFormBuilderSurveyTargetPage from '../survey/CourseBuilderFormBuilderSurveyTargetPage'
import CourseBuilderFormBuilderFormTargetPage from '../survey/CourseBuilderFormBuilderFormTargetPage'
import CourseSchedulePage from "../_shared/CourseSchedulePage.tsx";
import CourseBuilderCurrenciesCertPage from '../currencies-certificate/CourseBuilderCurrenciesCertPage.tsx';

// Wildcard-routed feature: the manifest registers
// `/course-management/course-builder/*` and this component dispatches the
// remaining path segments locally. Keeps the auto-discovered manifest contract
// (one path + one page) while supporting list / detail / category screens.
export default function CourseBuilderRoutes() {
  return (
    <Routes>
      <Route index element={<CourseBuilderListPage />} />
      <Route path=":id" element={<CourseBuilderDetailPage />} />
      <Route path=":id/category/course-information" element={<CourseBuilderCourseInfoPage />} />
      <Route path=":id/category/material" element={<CourseBuilderMaterialPage />} />
      <Route path=":id/category/material/all" element={<CourseBuilderMaterialFilesPage />} />
      <Route
        path=":id/category/material/lesson/:lessonId"
        element={<CourseBuilderMaterialLessonPage />}
      />
      <Route path=":id/category/surveys" element={<CourseBuilderFormBuilderPage />} />
      <Route path=":id/category/surveys/all" element={<CourseBuilderFormBuilderAllPage />} />
      <Route
        path=":id/category/surveys/survey/course"
        element={<CourseBuilderFormBuilderSurveyTargetPage />}
      />
      <Route
        path=":id/category/surveys/survey/lesson/:lessonId"
        element={<CourseBuilderFormBuilderSurveyTargetPage />}
      />
      <Route
        path=":id/category/surveys/form/course"
        element={<CourseBuilderFormBuilderFormTargetPage />}
      />
      <Route
        path=":id/category/surveys/form/lesson/:lessonId"
        element={<CourseBuilderFormBuilderFormTargetPage />}
      />
      <Route path=":id/category/evaluation" element={<CourseBuilderEvaluationPage />} />
      <Route path=":id/category/evaluation/all" element={<CourseBuilderEvaluationAllPage />} />
      <Route
        path=":id/category/evaluation/course"
        element={<CourseBuilderEvaluationLessonPage />}
      />
      <Route
        path=":id/category/evaluation/lesson/:lessonId"
        element={<CourseBuilderEvaluationLessonPage />}
      />
        <Route path=":id/category/schedule" element={<CourseSchedulePage />} />
      <Route path=":id/category/currencies-certificate" element={<CourseBuilderCurrenciesCertPage />} />
      <Route path=":id/category/:category" element={<CategoryStub />} />
    </Routes>
  )
}

function CategoryStub() {
  const {id} = useParams<{id: string}>()
  return (
    <CategoryStubPage
      detailPath={`/course-management/course-builder/${id}`}
      scopeLabel="Course Builder"
    />
  )
}
