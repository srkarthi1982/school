import { FeatureManifest } from "../../../infra/shared/types/permissions";
import FileSharingPage from "./FileSharingSection";


const featureManifest:FeatureManifest = {
    i18n : 'fileSharing.tab',
    page : FileSharingPage,
    path : 'FileSharingPage',
    permissions: ["file:read"],
    order : 30
}

export default featureManifest