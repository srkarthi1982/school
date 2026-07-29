import { FeatureManifest } from "../../../infra/shared/types/permissions.ts";
import UsageAnalyticsPage from "./UsageAnalyticsPage.tsx";

const manifest: FeatureManifest = {
    i18n: 'nav.usageAnalytics',
    path: 'usage-analytics',
    page: UsageAnalyticsPage,
    order: 31,
    permissions: ['analytics:read'],
}

export default manifest;
