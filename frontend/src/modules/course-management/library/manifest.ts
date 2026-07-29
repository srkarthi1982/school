import {FeatureManifest} from "../../../infra/shared/types/permissions.ts";
import LibraryPanelPage from "./panel/PanelPage.tsx";

const featureManifest: FeatureManifest = {
    i18n: 'nav.courseManagement.library.title',
    permissions: [],
    path: 'library',
    page: LibraryPanelPage
}

export default featureManifest