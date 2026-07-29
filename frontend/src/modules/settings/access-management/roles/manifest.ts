import {FeatureManifest} from "../../../../infra/shared/types/permissions.ts";
import RolesPage from "./RolesPage.tsx";

const manifest: FeatureManifest = {
    i18n: 'nav.accessManagement.roles',
    path: 'roles',
    order : 10,
    page : RolesPage
}

export default manifest;