import {FeatureManifest} from "../../../../infra/shared/types/permissions.ts";
import AccessControlPage from "./AccessControlPage.tsx";

const manifest: FeatureManifest = {
    i18n: 'nav.accessManagement.control',
    path: 'access-control',
    order : 10,
    page : AccessControlPage
}

export default manifest;