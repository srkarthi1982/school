import {ModuleManifest} from "../../../infra/shared/types/permissions.ts";
import {HiOutlineUsers} from "react-icons/hi2";
import UsersPage from "./pages/UsersPage.tsx";

const manifest:ModuleManifest = {
    i18n: 'nav.admin.addUserOrEditProfile',
    path: 'users',
    page: UsersPage,
    order: 20,
    permissions: ['admin:full'],
    icon : HiOutlineUsers
}

export default manifest;