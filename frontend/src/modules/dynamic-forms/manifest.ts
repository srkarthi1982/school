import {ModuleManifest} from "../../infra/shared/types/permissions.ts";
import DynamicFormsPage from "./pages/DynamicFormsPage.tsx";
import {MdOutlineDynamicForm} from "react-icons/md";

const manifest:ModuleManifest = {
    i18n: 'nav.dynamicForms',
    path: 'dynamic-forms',
    page: DynamicFormsPage,
    order: 20,
    permissions: ['*hidden*'],
// hidden temporarily
//    permissions: ['admin:full'],
    icon : MdOutlineDynamicForm
}

export default manifest;