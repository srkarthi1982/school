import {Route, Routes, useParams} from 'react-router-dom'
import CategoryStubPage from '../_shared/CategoryStubPage'
import CourseSelectionDetailPage from './CourseSelectionDetailPage'
import CourseSelectionListPage from './CourseSelectionListPage'
import PersonnelPage from './PersonnelPage'
import CourseSelectionMaterialPage from './material/CourseSelectionMaterialPage'
import CourseSelectionMaterialFilesPage from './material/CourseSelectionMaterialFilesPage'
import CourseSelectionMaterialLessonPage from './material/CourseSelectionMaterialLessonPage'
import CourseSelectionFormPage from './form/CourseSelectionFormPage'
import CourseSelectionFormAllPage from './form/CourseSelectionFormAllPage'
import CourseSelectionFormSurveyTargetPage from './form/CourseSelectionFormSurveyTargetPage'
import CourseSelectionFormFormTargetPage from './form/CourseSelectionFormFormTargetPage'
import CourseSelectionEvaluationPage from './evaluation/CourseSelectionEvaluationPage'
import CourseSelectionEvaluationAllPage from './evaluation/CourseSelectionEvaluationAllPage'
import CourseSelectionEvaluationLessonPage from './evaluation/CourseSelectionEvaluationLessonPage'
import CourseSelectionCourseInfoPage from './course-info/CourseSelectionCourseInfoPage'
import CourseSelectionCurrenciesCertPage from './currencies-certificate/CourseSelectionCurrenciesCertPage'
import CourseSelectionSchedulePage from './schedule/CourseSelectionSchedulePage'

// Wildcard-routed feature, mirroring CourseBuilderRoutes: the manifest
// registers `/course-management/course-selection/*` and this component
// dispatches the remaining path segments locally. Personnel, Material, Form
// and Evaluation are implemented for instances — the rest fall through to the
// shared stub page.
export default function CourseSelectionRoutes() {
  return (
    <Routes>
      <Route index element={<CourseSelectionListPage />} />
      <Route path=":id" element={<CourseSelectionDetailPage />} />
      <Route path=":id/category/personnel" element={<PersonnelPage />} />
      <Route path=":id/category/course-information" element={<CourseSelectionCourseInfoPage />} />
      <Route path=":id/category/material" element={<CourseSelectionMaterialPage />} />
      <Route path=":id/category/material/all" element={<CourseSelectionMaterialFilesPage />} />
      <Route
        path=":id/category/material/lesson/:lessonId"
        element={<CourseSelectionMaterialLessonPage />}
      />
      <Route path=":id/category/surveys" element={<CourseSelectionFormPage />} />
      <Route path=":id/category/surveys/all" element={<CourseSelectionFormAllPage />} />
      <Route
        path=":id/category/surveys/survey/course"
        element={<CourseSelectionFormSurveyTargetPage />}
      />
      <Route
        path=":id/category/surveys/survey/lesson/:lessonId"
        element={<CourseSelectionFormSurveyTargetPage />}
      />
      <Route
        path=":id/category/surveys/form/course"
        element={<CourseSelectionFormFormTargetPage />}
      />
      <Route
        path=":id/category/surveys/form/lesson/:lessonId"
        element={<CourseSelectionFormFormTargetPage />}
      />
      <Route path=":id/category/schedule" element={<CourseSelectionSchedulePage />} />
      <Route path=":id/category/currencies-certificate" element={<CourseSelectionCurrenciesCertPage />} />
      <Route path=":id/category/evaluation" element={<CourseSelectionEvaluationPage />} />
      <Route path=":id/category/evaluation/all" element={<CourseSelectionEvaluationAllPage />} />
      <Route
        path=":id/category/evaluation/course"
        element={<CourseSelectionEvaluationLessonPage />}
      />
      <Route
        path=":id/category/evaluation/lesson/:lessonId"
        element={<CourseSelectionEvaluationLessonPage />}
      />
      <Route path=":id/category/:category" element={<CategoryStub />} />
    </Routes>
  )
}

function CategoryStub() {
  const {id} = useParams<{id: string}>()
  return (
    <CategoryStubPage
      detailPath={`/course-management/course-selection/${id}`}
      scopeLabel="Course Selection"
    />
  )
}
