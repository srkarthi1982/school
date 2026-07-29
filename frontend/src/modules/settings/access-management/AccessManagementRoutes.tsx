import {Route, Routes} from 'react-router-dom'

import AccessManagementPage from './AccessMAnagementPage'
import AccessManagementWrapper from './AccessManagementWrapper'
import {CATEGORIES, type CategorySlug} from './_shared/types'

export default function AccessManagementRoutes() {
    return (
        <Routes>
            <Route index element={<AccessManagementPage />} />
            {CATEGORIES.map((cat) => (
                <Route
                    key={cat.slug}
                    path={cat.slug}
                    element={
                        <AccessManagementWrapper pageTitle={cat.pageTitle} pageDescription={cat.pageDescription} icon={cat.icon}>
                            <cat.pageComponent />
                        </AccessManagementWrapper>
                    }
                />
            ))}
        </Routes>
    )
}
