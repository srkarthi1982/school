import {FeatureManifest} from "../../../infra/shared/types/permissions.ts";
import EnrolledStudentsPage from "./EnrolledStudentsPage.tsx";

const featureManifest:FeatureManifest = {
    i18n : 'nav.courseManagement.enrolledStudents.title',
    permissions : ['student:*'],
    path : 'enrolled-students',
    page : EnrolledStudentsPage,
}

export default featureManifest