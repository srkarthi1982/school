import {FeatureManifest} from "../../../../infra/shared/types/permissions.ts";
import AccessControlPage from "./PermissionsPage.tsx";

const manifest: FeatureManifest = {
    i18n: 'nav.accessManagement.permissions',
    path: 'permissions',
    order : 10,
    page : AccessControlPage
}

export default manifest;