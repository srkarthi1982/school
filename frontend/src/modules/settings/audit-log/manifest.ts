import {FeatureManifest} from "../../../infra/shared/types/permissions.ts";
import AuditLogPage from "./AuditLogPage.tsx";

const manifest: FeatureManifest = {
    i18n: 'nav.auditLog',
    path: 'audit-log',
    page: AuditLogPage,
    order: 30,
    permissions: ['audit:read'],
}

export default manifest;
