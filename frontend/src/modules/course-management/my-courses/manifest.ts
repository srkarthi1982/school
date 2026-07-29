import {FeatureManifest} from "../../../infra/shared/types/permissions.ts";
import MyCoursesPage from "./MyCoursesPage.tsx";

const featureManifest:FeatureManifest = {
    i18n : 'nav.courseManagement.myCourses.title',
    permissions : ['teacher:*','admin:full'],
    path : 'my-courses',
    page : MyCoursesPage
}

export default featureManifest