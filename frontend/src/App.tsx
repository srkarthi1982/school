import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './infra/auth/LoginPage'
import RegisterPage from './infra/auth/RegisterPage'
import useAuthStore, {
  selectInitialize,
  selectIsAuthenticated,
} from './infra/auth/useAuthStore'
import useClassroomStore from './modules/communication-reporting/virtual-classroom/classroomStore'
import { MENU_CONFIG } from './infra/config/menu.config'
import { flattenRoutes } from './infra/shared/utils/menuUtils'
import ErrorBoundary from './infra/shared/components/ErrorBoundary'
import Layout from './infra/shared/components/Layout'
import ModuleRedirect from './infra/shared/components/ModuleRedirect'
import ProtectedRoute from './infra/shared/components/ProtectedRoute'
import PermissionGuard from './infra/shared/components/PermissionGuard'
import UnauthorizedPage from './infra/shared/pages/UnauthorizedPage'
import NotFoundPage from './infra/shared/pages/NotFoundPage'
import DesignSystemPage from './modules/profile-general-info/design-system/DesignSystemPage'
import UserProfileInfoPage from './modules/profile-general-info/UserProfileInfoPage'
import ToastContainer from './infra/shared/components/NotificationToastContainer'
import ChatRuntimeProvider from './modules/communication-reporting/chat/ChatRuntimeProvider'
import TopLoadingBar from './infra/shared/components/TopLoadingBar'
import VirtualClassroomDetailPage from './modules/communication-reporting/virtual-classroom/VirtualClassroomDetailPage'
import VirtualClassroomLivePage from './modules/communication-reporting/virtual-classroom/VirtualClassroomLivePage'
import FileViewer from './modules/course-management/library/panel/FileViewer'
import AircraftViewerPage from './modules/course-management/library/panel/AircraftViewerPage'

const allRoutes = flattenRoutes(MENU_CONFIG)

export default function App() {
  const initialize = useAuthStore(selectInitialize)
  const isAuthenticated = useAuthStore(selectIsAuthenticated)

  useEffect(() => {
    initialize()
  }, [initialize])

  // G11 � once auth is confirmed, ask the classroom store whether it
  // should rejoin a session persisted from the previous tab/refresh.
  // The store reads localStorage and silently no-ops if nothing is
  // pending or the user simply left the class normally.
  useEffect(() => {
    if (!isAuthenticated) return
    void useClassroomStore.getState().restoreFromStorage()
  }, [isAuthenticated])

  return (
    <ErrorBoundary>
      <TopLoadingBar />
      <ToastContainer></ToastContainer>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <ProtectedRoute>
              <ChatRuntimeProvider>
                <Layout />
              </ChatRuntimeProvider>
            </ProtectedRoute>
          }
        >
          {/* Hidden static routes */}
          <Route path="/" element={<ErrorBoundary><PermissionGuard permissions={["teacher:read", "student:read", "admin:full"]}><UserProfileInfoPage /></PermissionGuard></ErrorBoundary>} />
          {/* Access Denied renders inside the layout (sidebar stays visible) so a
              denied route only swaps the content area, not the whole screen. */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/design-system"
            element={
              <ErrorBoundary>
                <PermissionGuard >
                  <DesignSystemPage />
                </PermissionGuard>
              </ErrorBoundary>
            }
          />
          <Route
            path="/communication-reporting/virtual-classroom/:id"
            element={
              <ErrorBoundary>
                <PermissionGuard permissions={['class_session:*']}>
                  <VirtualClassroomDetailPage />
                </PermissionGuard>
              </ErrorBoundary>
            }
          />
          <Route
            path="/communication-reporting/virtual-classroom/:id/live"
            element={
              <ErrorBoundary>
                <PermissionGuard permissions={['class_session:join']}>
                  <VirtualClassroomLivePage />
                </PermissionGuard>
              </ErrorBoundary>
            }
          />

          {/* FileViewer — navigation-based file reader for Library materials
              (PDF + Office). Mounted inside Layout so the sidebar survives.
              Opening a file is now a real navigation — the browser back button
              returns to whatever page you came from. */}
          <Route
            path="/course-management/library/view/:materialId"
            element={
              <ErrorBoundary>
                <FileViewer />
              </ErrorBoundary>
            }
          />
          <Route
            path="/course-management/library/aircraft-viewer/:materialId"
            element={
              <ErrorBoundary>
                <AircraftViewerPage />
              </ErrorBoundary>
            }
          />

          {/* Generated routes from MENU_CONFIG */}
          {allRoutes.map((route) => {
            const element =
              route.kind === 'module-redirect'
                ? <ModuleRedirect
                    basePath={route.basePath}
                    children={route.children}
                    parentPermissions={route.parentPermissions}
                  />
                : <route.page />

            const needsGuard = route.kind === 'page' && !!route.permissions?.length
            const guarded = needsGuard
              ? <PermissionGuard permissions={route.permissions}>{element}</PermissionGuard>
              : element

            return (
              <Route
                key={route.path}
                path={route.path}
                element={<ErrorBoundary>{guarded}</ErrorBoundary>}
              />
            )
          })}

          {/* Legacy alias redirect */}
          <Route path="/common/dashboard" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
