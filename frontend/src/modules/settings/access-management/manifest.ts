import {ModuleManifest} from "../../../infra/shared/types/permissions.ts";
import {HiOutlineShieldCheck} from "react-icons/hi2";
import AccessManagementRoutes from "./AccessManagementRoutes.tsx";

const manifest: ModuleManifest = {
    i18n: 'nav.accessManagement.title',
    icon: HiOutlineShieldCheck,
    //path: '/access-management',
    path: 'access-management/*',
    order : 10,
    page: AccessManagementRoutes,
    permissions : ['admin:*']
}

export default manifest;