# Developer Guide - Implementing a New Module

This guide walks a developer through creating a complete module or feature from scratch: API client generation, store setup, page creation, and integration.

---


## 1. Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React 19 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v3 + CSS custom properties |
| State management | Zustand |
| API client | hey-api (`@hey-api/openapi-ts`) — generated from OpenAPI spec |
| Routing | React Router v6 |
| Icons | Heroicons 2 via `react-icons/hi2` (also `react-icons/io5`, `react-icons/md`) |
| i18n | Custom `I18nContext` (EN + AR, RTL-aware) |
| Theme | Custom `ThemeContext` (light / dark, CSS variables) |

---

## 2. Prerequisites & Setup

```bash
cd frontend
npm install

# Backend must be running at http://localhost:8000 before generating types
npm run generate-types

npm run dev
```

The app runs at `http://localhost:5175`.

> **Backend required.** The frontend communicates with a FastAPI backend at `http://localhost:8000`. Make sure it is running before generating types or testing any CRUD operations.

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server at port 5175 |
| `npm run build` | TypeScript type-check + Vite production build |
| `npm run type-check` | TypeScript type-check only (no emit) |
| `npm run build-only` | Vite build only — skips type check |
| `npm run generate-api` | Regenerate API client from backend OpenAPI spec |
| `npm run generate-permissions` | Regenerate `PermissionCode` literal union from backend |
| `npm run generate-types` | Run both generators sequentially (api + permissions) |
| `npm run test:e2e` | Run Playwright e2e tests |

> **Always run `npm run build`** before committing — it runs both the type-checker and Vite build. (Or rely on the git hooks below to do it for you.)

---

## 2.5 Git Hooks (Pre-commit & Pre-push Guards)

The frontend ships with [Husky](https://typicode.github.io/husky/) hooks that act as a safety net so no broken-compile code ever reaches the history.

| Hook | Command | Time | What it catches |
|---|---|---|---|
| `pre-commit` | `npm run type-check` | ~5s | Type errors, missing imports, typos in `PermissionCode` literals |
| `pre-push` | `npm run build` | ~30–60s | Everything above + Vite-specific errors (asset resolve, dynamic imports, plugin failures) |

### One-time setup

Hook scripts live in `frontend/.husky/`. Husky is registered as a frontend dev-dependency, and the `prepare` script in `frontend/package.json` activates the hooks against the repo's git root.

```bash
# At the repo root (parent of frontend/)
git init                # if the repo isn't initialized yet

cd frontend
npm install             # installs husky + auto-runs `prepare` → hooks active
```

The `prepare` script runs `cd .. && husky frontend/.husky`, which configures git to look up hooks under `frontend/.husky/` from the repo root.

### Fresh clone checklist

```bash
git clone <url>
cd <repo>/frontend
npm install            # installs deps + activates hooks
npm run generate-types # generates API client + PermissionCode (backend must be running)
```

> Hooks need `frontend/src/api/generated/` to exist (it's `.gitignore`d). On a fresh clone the first `git commit` will fail until you run `generate-types`.

### Bypassing (emergency only)

```bash
git commit --no-verify -m "..."
git push   --no-verify
```

Use sparingly — the whole point is to never push code that won't compile. If a hook fires a false positive, fix the underlying issue rather than reaching for `--no-verify`.

---

## 3. Module Structure

The sidebar and routes are **auto-generated** by scanning `src/modules/`. Each module contributes a `manifest.ts`; each feature inside a module contributes its own `manifest.ts`. There is **no central registration file to edit** — drop in a manifest, save, and the route + sidebar entry appear automatically.

### Convention

```
src/modules/<module>/
├── manifest.ts                    ← module manifest (i18n, icon, path, permissions, optional page, optional order)
├── <ModuleName>DefaultPage.tsx    ← optional — only if module manifest declares `page`
├── store.ts                       ← optional — store for the module-level page
└── <feature>/
    ├── manifest.ts                ← feature manifest (i18n, path RELATIVE, page, optional permissions, optional order)
    ├── <PageName>.tsx             ← page
    └── store.ts                   ← optional — store for this feature
```

### Live module tree (today)

```
src/modules/
├── profile-general-info/    (path '/profile-general-info', permissions ['teacher:read','student:read'], order 0, page UserProfileInfoPage)
│   └── design-system/       (file lives here; hidden static route in App.tsx, gated by 'admin:full')
├── access-management/       (path '/access-management', permissions ['admin:*'], order 10)
│   ├── access-control/
│   ├── permissions/
│   └── roles/
├── dynamic-forms/           (path 'dynamic-forms', permissions ['admin:full'], order 20, page DynamicFormsPage)
├── users-management/        (path 'users', permissions ['admin:full'], order 20, page UsersPage)
├── dashboard-scheduling/    (path '/dashboard-scheduling', permissions ['schedule_entry:*'], order 30)
│   ├── dashboard/           (DashboardPage — no manifest; also used at root '/')
│   └── schedule-management/
│   └── progress-tracker/           (permissions ['progress_tracker:*'])
├── course-management/       (path '/course-management', permissions ['student:*','teacher:*'], order 40)
│   ├── announcements/
│   ├── course-materials/
│   ├── enrolled-students/
│   └── my-courses/
├── assignment-assessment/   (path '/assignment-assessment', permissions ['quiz:*'], order 50)
│   └── quiz-bank/
├── grading-attendance/      (path '/grading-attendance', permissions ['teacher:*','student:*'], order 60)
│   ├── attendance/
│   ├── grades/
│   └── records/
├── communication-reporting/ (path '/communication-reporting', permissions ['teacher:*','student:*'], order 70)
│   ├── chat/
│   ├── faq/
│   ├── file-sharing/
│   ├── it-support/
│   ├── notification/
│   ├── requests/
│   └── virtual-classroom/
├── external-link/           (path '/external-link', permissions ['teacher:*','student:*'], order 80)
│   └── apps/
└── settings/                (path '/settings', public, order 90, pinBottom)
    ├── account/
    ├── appearance/
    └── language/
```

> Modules without a `page` field on the module manifest auto-redirect (`<ModuleRedirect>`) to the first accessible feature. To add a new feature, drop a `manifest.ts` + page file into a folder under the module — auto-discovery picks it up at build time.

**Note on `schedule_entry:*` permissions:** the `dashboard-scheduling/schedule-management` feature persists user-owned calendar entries through the backend `schedule_entry` module. Two granular codes exist: `schedule_entry:read` (view) and `schedule_entry:write` (create/update/delete/drag/resize). Default role mapping in `backend/app/core/permissions.py` grants both to admin/teacher/student/staff.

### Manifest field reference

```ts
// src/infra/shared/types/permissions.ts
export type ModuleManifest = {
  i18n: ValidTranslationKeys        // sidebar label
  icon: IconType                    // sidebar icon (react-icons)
  path: string                      // ABSOLUTE — e.g. '/course-management'
  page?: ComponentType              // optional — if absent, module redirects to first accessible feature
  permissions?: PermissionPattern[] // optional — gates by permission pattern (any-of, supports wildcards)
  pinBottom?: true                  // optional — pins to bottom of sidebar (used by settings)
  order?: number                    // optional — lower = earlier; default = Infinity (last). Use gaps of 10.
}

export type FeatureManifest = {
  i18n: ValidTranslationKeys        // submenu label
  path: string                      // RELATIVE — e.g. 'syllabus' (joined with module.path → '/course-management/syllabus')
  page: ComponentType               // required
  permissions?: PermissionPattern[] // optional — inherits from parent module if absent
  order?: number                    // optional — same semantics as module
}

// PermissionPattern accepts:
//   • exact `PermissionCode`     e.g. 'user:read'
//   • prefix wildcard 'X:*'      e.g. 'chat:*' matches chat:read, chat:write, …
//   • global wildcard '*'        matches anything (public-with-auth)
type PermissionPattern = PermissionCode | (string & {})
```

`PermissionCode` is an auto-generated string-literal union (see [Section 9](#9-permissions--type-safety)). Access is gated **only by `permissions`** — a user passes if any of their permissions matches any listed pattern. Empty/absent `permissions` makes the route public-with-auth.

### How it gets wired

- `src/infra/config/menu.config.tsx` runs `import.meta.glob('../../modules/*/manifest.ts')` and `import.meta.glob('../../modules/*/*/manifest.ts')` at build time, sorts by `order`, and exports a `MENU_CONFIG: MenuItem[]`.
- `src/App.tsx` calls `flattenRoutes(MENU_CONFIG)` and registers React Router routes:
  - Module with `page` → renders that page at `module.path`.
  - Module without `page` → renders `<ModuleRedirect>` at `module.path`, which redirects to the first child the current user can access.
  - Each feature → renders `feature.page` at `module.path + '/' + feature.path` wrapped in `<PermissionGuard>` (feature `permissions`, or inherited from module).
- `src/infra/shared/components/Layout.tsx` detects the active module via `useLocation()` and renders `<SubmenuAside>` next to `<Outlet />` whenever the active module has features. **Pages must not render their own submenu sidebar** — the layout owns it.

### Hidden routes (no sidebar entry)

A handful of routes are not modules and are wired statically in `src/App.tsx`:

- `/` — `DashboardPage`
- `/design-system` — `DesignSystemPage` (admin-only)
- `/login`, `/register`, `/unauthorized`

If you need a route that should not appear in the sidebar, add it to `App.tsx` as a static `<Route>` rather than creating a manifest.

### Top-level `src/` layout

```
src/
├── api/           ← auto-generated hey-api client + client.ts (interceptors)
├── infra/         ← cross-cutting infrastructure shared by every module
│   ├── auth/          LoginPage, RegisterPage, useAuthStore
│   ├── config/        menu.config.tsx (the auto-discovery generator)
│   ├── locales/       I18nContext + en.json + ar.json
│   ├── shared/        components, pages, types, utils (details below)
│   └── theme/         ThemeContext
├── modules/       ← feature modules (see tree above)
├── App.tsx
├── main.tsx
└── index.css
```

### Shared utilities (inside `src/infra/shared/`)

```
src/infra/shared/
├── components/
│   ├── CrudPage.tsx           ← Generic CRUD table + modal component
│   ├── Layout.tsx             ← App shell — responsive: sidebar+SubmenuAside (≥1024px) / bottom nav+tabs (<1024px)
│   ├── SidebarMenu.tsx        ← Main sidebar (one entry per module) — desktop only
│   ├── SubmenuAside.tsx       ← In-page submenu — rendered by Layout when active module has features (desktop only; accepts optional className)
│   ├── BottomNav.tsx          ← Mobile bottom nav (4 primary modules + "More") — visible only <1024px
│   ├── MoreSheet.tsx          ← Bottom-sheet drawer for overflow modules in mobile bottom nav
│   ├── MobileSubmenuTabs.tsx  ← Horizontal scrollable submenu tabs above content (mobile/tablet)
│   ├── MobileModuleHeader.tsx ← Module title strip above mobile submenu tabs
│   ├── ModuleRedirect.tsx     ← Used at module.path when the module has no page
│   ├── ProtectedRoute.tsx     ← Redirects unauthenticated users to /login
│   ├── PermissionGuard.tsx    ← Redirects users lacking required permissions to /unauthorized
│   ├── ErrorBoundary.tsx      ← React error boundary wrapper
│   └── Paginator.tsx          ← Pagination navigation component
├── pages/
│   ├── PlaceholderPage.tsx    ← Shared "coming soon" placeholder component
│   ├── UnauthorizedPage.tsx
│   └── NotFoundPage.tsx
├── types/
│   ├── permissions.ts         ← PermissionCode, PermissionPattern, AccessRequirement, MenuItem, SubMenuItem, ModuleManifest, FeatureManifest
│   ├── permissions.gen.ts     ← AUTO-GENERATED — PermissionCode literal union + ALL_PERMISSION_CODES (do not edit by hand)
└── utils/
    ├── apiError.ts            ← throwIfError() + extractErrorMessage()
    ├── createCrudStore.ts     ← Factory: creates a full CRUD Zustand store in ~15 lines
    ├── menuUtils.ts           ← canAccess() (OR semantics), flattenRoutes(), filterMenuForSidebar(), findActiveModule(), joinPath()
    └── storeHelpers.ts        ← Pagination type, extractPaged(), buildQuery()
```

> The mobile/desktop split is purely a Tailwind responsive concern (`hidden lg:flex` / `lg:hidden` / `flex-col lg:flex-row`) — the same `MENU_CONFIG` drives both. Pages should not branch on viewport.

### Import path conventions

For a file at `src/modules/<module>/<feature>/...`:

| Target | Import |
|---|---|
| Own store | `from './store'` |
| Module-level page (sibling to feature folder) | `from '../<ModuleName>DefaultPage'` |
| Sibling feature in same module | `from '../<other-feature>/...'` |
| Cross-module file | `from '../../<other-module>/<...>'` |
| Infra shared | `from '../../../infra/shared/...'` |
| i18n | `from '../../../infra/locales/I18nContext'` |
| Auth store | `from '../../../infra/auth/useAuthStore'` |
| Theme | `from '../../../infra/theme/ThemeContext'` |
| Generated API types/functions | `from '../../../api/generated'` |
| API client | `from '../../../api/client'` (always **first** import in stores) |

For a module-level file at `src/modules/<module>/...` (one level shallower), drop one `../` segment from each path.

---

## 4. Step 1 — Generate the API Client

The API client is auto-generated from the backend's OpenAPI specification. You must regenerate it whenever the backend API changes.

```bash
# Backend must be running first
npm run generate-api
```

This reads `openapi-ts.config.ts` and writes typed functions + types to `src/api/generated/`.

### Function naming convention

Generated functions follow this pattern:

```
{verb}{Resource}ApiV1{Prefix}{ResourcePath}{HttpMethod}
```

Examples:
- `listDepartmentsApiV1CommonDepartmentsGet`
- `createDepartmentApiV1CommonDepartmentsPost`
- `updateDepartmentApiV1CommonDepartmentsDepartmentIdPut`
- `deleteDepartmentApiV1CommonDepartmentsDepartmentIdDelete`

Always import them with **short aliases** to keep store code readable:

```ts
import {
    listDepartmentsApiV1CommonDepartmentsGet              as listDepartments,
    createDepartmentApiV1CommonDepartmentsPost            as createDepartmentApi,
    updateDepartmentApiV1CommonDepartmentsDepartmentIdPut as updateDepartmentApi,
    deleteDepartmentApiV1CommonDepartmentsDepartmentIdDelete as deleteDepartmentApi,
} from '../../../api/generated'
```

### Critical: hey-api never throws

hey-api always returns `{ data, error }`. It **never** throws an exception, even on 4xx/5xx responses. You must destructure and check both fields manually:

```ts
// GOOD
const { data, error } = await createDepartmentApi({ body: payload })
throwIfError(error)   // converts error object to thrown Error if non-null

// BAD — silently swallows errors
const result = await createDepartmentApi({ body: payload })
```

---

## 5. Step 2 — Decide: New Module or New Feature?

**New feature inside an existing module** — most common. Pick the module that matches the feature's purpose (`access-management`, `users-management`, `profile-general-info`, `dynamic-forms`, `dashboard-scheduling`, `course-management`, `assignment-assessment`, `grading-attendance`, `communication-reporting`, `external-link`, `settings`).

For a Notices feature inside communication-reporting:

```
src/modules/communication-reporting/
└── notices/
    ├── manifest.ts        ← feature manifest
    ├── NoticesPage.tsx    ← page
    └── store.ts           ← store (exclusive to this page)
```

**New module** — when no existing module fits. Create a new folder under `src/modules/` with a `manifest.ts` (and either a `page` field pointing at a default page, or at least one feature subfolder so the module can redirect to it).

```
src/modules/billing/
├── manifest.ts            ← module manifest (path '/billing', icon, role, order)
├── invoices/
│   ├── manifest.ts        ← feature manifest (path 'invoices', page, ...)
│   └── InvoicesPage.tsx
└── payments/
    ├── manifest.ts
    └── PaymentsPage.tsx
```

**Naming conventions:**
- **Module / feature folder name**: `kebab-case` (e.g. `notices/`, `lesson-plan/`, `dynamic-forms/`).
- **Page filename**: `{ComponentName}Page.tsx` (PascalCase). Module-level default pages use `{ModuleName}DefaultPage.tsx`.
- **Store filename**: always `store.ts` inside the feature (or module) folder. Pages import via `from './store'`.
- Pages are imported by full path inside their own `manifest.ts` — there are no barrel files.

---

## 6. Step 3 — Set Up the Store

Two patterns: **factory** (preferred for simple CRUD) and **manual** (for complex logic).

### Option A: `createCrudStore` Factory (recommended)

For any resource with straightforward list/create/update/delete:

| Key | Type | Description |
|-----|------|-------------|
| `items` | `T[]` | Current page of records |
| `pagination` | `Pagination` | `{ total, page, page_size, pages }` |
| `fetchParams` | `SortFilterParams` | Last sort/filter params used |
| `fetch(page?, params?)` | `Promise<void>` | Load a page |
| `create(payload)` | `Promise<void>` | Create + re-fetch |
| `update(id, payload)` | `Promise<void>` | Update + re-fetch |
| `remove(id)` | `Promise<void>` | Delete + re-fetch |

```ts
// src/modules/communication-reporting/notices/store.ts
import '../../../api/client'                                       // ← ALWAYS first
import {
    listNoticesApiV1AdminNoticesGet              as listNotices,
    createNoticeApiV1AdminNoticesPost            as createNoticeApi,
    updateNoticeApiV1AdminNoticesNoticeIdPut     as updateNoticeApi,
    deleteNoticeApiV1AdminNoticesNoticeIdDelete  as deleteNoticeApi,
} from '../../../api/generated'
import type { NoticeResponse } from '../../../api/generated'
import { createCrudStore } from '../../../infra/shared/utils/createCrudStore'

const useNoticesStore = createCrudStore<NoticeResponse>({
    listApi:   listNotices,
    createApi: (args) => createNoticeApi(args),
    updateApi: (args) => updateNoticeApi(args),
    deleteApi: (args) => deleteNoticeApi(args),
    idPath:    (id) => ({ notice_id: id }),
})

export default useNoticesStore
```

### Option B: Manual Store (for complex logic)

Use when you need multiple list states, custom fetch logic, extra actions, or state that doesn't fit `createCrudStore`. Reference: `src/modules/users-management/pages/store.ts`.

```ts
import { create } from 'zustand'
import '../../../api/client'                                      // ← ALWAYS first
import {
    listNoticesApiV1AdminNoticesGet              as listNotices,
    createNoticeApiV1AdminNoticesPost            as createNoticeApi,
    updateNoticeApiV1AdminNoticesNoticeIdPut     as updateNoticeApi,
    deleteNoticeApiV1AdminNoticesNoticeIdDelete  as deleteNoticeApi,
} from '../../../api/generated'
import type { NoticeResponse } from '../../../api/generated'
import type { SortFilterParams } from '../../../infra/shared/components/CrudPage'
import { throwIfError } from '../../../infra/shared/utils/apiError'
import { DEFAULT_PAGINATION, extractPaged, buildQuery, type Pagination } from '../../../infra/shared/utils/storeHelpers'

interface NoticesState {
    items: NoticeResponse[]
    pagination: Pagination
    fetchParams: SortFilterParams
    fetch:  (page?: number, params?: SortFilterParams) => Promise<void>
    create: (payload: Record<string, unknown>) => Promise<void>
    update: (id: number, payload: Record<string, unknown>) => Promise<void>
    remove: (id: number) => Promise<void>
}

const useNoticesStore = create<NoticesState>((set, get) => ({
    items: [],
    pagination: { ...DEFAULT_PAGINATION },
    fetchParams: {},

    fetch: async (page = 1, params?) => {
        const effectiveParams = params !== undefined ? params : get().fetchParams
        if (params !== undefined) set({ fetchParams: params })
        const { data } = await listNotices({ query: buildQuery(page, effectiveParams) as any })
        if (data) {
            const { items, pagination } = extractPaged<NoticeResponse>(data)
            set({ items, pagination })
        }
    },

    create: async (payload) => {
        const { error } = await createNoticeApi({ body: payload as any })
        throwIfError(error)
        get().fetch(get().pagination.page)
    },

    update: async (id, payload) => {
        const { error } = await updateNoticeApi({ path: { notice_id: id }, body: payload as any })
        throwIfError(error)
        get().fetch(get().pagination.page)
    },

    remove: async (id) => {
        const { error } = await deleteNoticeApi({ path: { notice_id: id } })
        throwIfError(error)
        get().fetch(get().pagination.page)
    },
}))

export default useNoticesStore
```

### Store checklist

- [ ] `import '../../../api/client'` is the **first** import
- [ ] State keys use standard names: `items`, `pagination`, `fetchParams`, `fetch`, `create`, `update`, `remove`
- [ ] Every mutating action calls `throwIfError(error)` before re-fetching
- [ ] After mutation, re-fetch with `get().fetch(get().pagination.page)` to stay on current page
- [ ] Import `Pagination`, `extractPaged`, `buildQuery` from `storeHelpers.ts` — **never copy-paste them**

---

## 7. Step 4 — Create the Page

### ⚠️ Critical: Always Import and Use `useShallow`

**🚨 The #1 cause of runtime errors in page components.**

```tsx
import { useShallow } from 'zustand/react/shallow'  // ← REQUIRED

const { items, fetch, create } = useMyStore(
    useShallow((s) => ({ items: s.items, fetch: s.fetch, create: s.create }))
)

// ❌ NEVER do this — causes infinite render loop
const items  = useMyStore((s) => s.items)
const fetch  = useMyStore((s) => s.fetch)
```

**Why TypeScript doesn't catch this:** the code compiles successfully but crashes at runtime with "Maximum update depth exceeded".

### ⚠️ Critical: i18n is Mandatory for All User-Facing Strings

Zero hardcoded strings. Every label, title, button text, column header, or message visible to the user must go through `useI18n`. This is required for Arabic support.

```tsx
import { useI18n } from '../../../infra/locales/I18nContext'
import type { ValidTranslationKeys } from '../../../infra/locales/I18nContext'
const tk = (k: string) => k as ValidTranslationKeys
```

```tsx
export default function NoticesPage() {
    const { t } = useI18n()
    return (
        <CrudPage
            title={t('nav.notices')}
            columns={[
                { key: 'id',    label: t('common.id') },
                { key: 'title', label: t('common.name'), sortable: true },
            ]}
            // ...
        />
    )
}
```

Prefer `common.*` keys for generic labels (id, name, code, description, actions, addNew, …) so translations are reused across pages.

### ⚠️ Pages must not render their own submenu sidebar

If your module has feature folders, the **layout** automatically renders `<SubmenuAside>` to the left of your page based on `MENU_CONFIG`. Your page just renders content. Putting a hand-rolled `<aside>` inside the page would duplicate it.

### ⚠️ Page layout: spacing & headers

**The Layout owns page margins.** `Layout.tsx` wraps every `<Outlet />` in a content container that already supplies the standard page padding (horizontal margin + top/bottom). **A page's root element must not add its own padding, margin, or width cap** — no `p-*`, `px-*`, `py-*`, `ps-*`, `pt-*`, `pb-*`, or `max-w-*` on the outermost element. Per-page padding makes margins inconsistent across the app and doubles up what the Layout already applies. The page root is a bare `<div>` or a `<div className="flex flex-col gap-*">`.

```tsx
// ❌ BAD — page caps width / adds its own root padding
<div className="px-9 pt-9 pb-10 max-w-3xl"> … </div>

// ✅ GOOD — bare root; the Layout supplies the margin
<div className="flex flex-col gap-6"> … </div>
```

**Page header — use the shared `SectionHeader`.** A page title (icon + title, optional description line) goes through one shared component: `src/infra/shared/components/SectionHeader.tsx`. Never hand-roll the title/divider markup inline, and never add a per-module copy of it.

```tsx
import SectionHeader from '../../../infra/shared/components/SectionHeader'

<SectionHeader icon={<HiOutlineBookOpen />} title={t('nav.myCourses')} />
<SectionHeader title={t('settings.account')} description={t('settings.accountDesc')} />
```

**Standard internal spacing** — keep these values consistent so pages line up:

| Concern | Use |
|---|---|
| Card / panel | the `.card` utility, with `px-5 py-4` content padding |
| Gap between cards in a grid or list | `gap-3` |
| Gap between major sections | `gap-4` |
| Table / list rows | separate with `border-t border-[var(--border)]` — not gaps |
| Small action buttons | `px-3 py-1.5` |

### Full-bleed (full-size) pages

By default the Layout frames every page with a standard content margin (`lg:p-6` on the content row + the Outlet wrapper's `pt-1/pb-10/ps-8`), and pages must not add their own. But some views need to fill the **entire content area edge-to-edge** — e.g. an immersive document/media reader. The live example is the document viewer in `src/modules/course-management/library/panel/` (`PdfViewer.tsx` / `OfficeViewer.tsx`).

The mechanism is a tiny shared flag, **`src/infra/shared/store/useFullBleedStore.ts`**:

- The active view flips the flag on while it's open and resets it on cleanup.
- `Layout.tsx` reads it and **drops its content frame** (and switches the content row to `overflow-visible`) so the view fills the area — while the **sidebar + submenu stay visible** (they keep their own padding). Mobile keeps its bottom-nav clearance automatically.

```tsx
import { useEffect } from 'react'
import useFullBleedStore from '../../../infra/shared/store/useFullBleedStore'

export default function MyImmersiveView() {
    const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
    const open = /* true while the full-bleed view should be active */ true

    // Turn full-bleed on while open; always reset on unmount / when it closes.
    useEffect(() => {
        setFullBleed(open)
        return () => setFullBleed(false)
    }, [open, setFullBleed])

    // Root fills the area — no border/rounded/padding of its own.
    return <div className="flex flex-col h-full w-full overflow-hidden bg-bg">…</div>
}
```

Rules:
- The full-bleed component's **root must be `h-full w-full`** (the Layout gives it a bounded height) with **no `p-*` / `border` / `rounded` / `max-w-*`** of its own.
- **Always reset the flag** in the effect cleanup, or other routes will inherit a frameless layout (the bug that drops the submenu's padding).
- Use this only for genuinely full-area views (readers, canvases, maps). Normal pages keep the standard frame — do **not** flip the flag for ordinary content.

### Option A: CrudPage (recommended for standard CRUD)

`CrudPage` (`src/infra/shared/components/CrudPage.tsx`) provides a complete table + create/edit modal + delete confirmation with sorting, filtering, and pagination.

**CrudPage handles these strings automatically via `useI18n` internally:**
- "Management" label above the title
- "Add New" button
- "Actions" column header
- "Edit" / "Delete" row buttons
- "No records found" empty state
- Modal header ("Edit" vs "Create")
- "Update the record below" / "Fill in the fields below" modal hints
- "Select..." placeholder for select fields
- "Are you sure you want to delete this?" confirm dialog
- "Cancel" / "Save" / "Create" modal footer buttons

**You only need to translate:** `title`, column `label`s, and form field `label`s.

```tsx
// src/modules/communication-reporting/notices/NoticesPage.tsx
import { useShallow } from 'zustand/react/shallow'
import CrudPage from '../../../infra/shared/components/CrudPage'
import useNoticesStore from './store'
import { useI18n } from '../../../infra/locales/I18nContext'

export default function NoticesPage() {
    const { t } = useI18n()
    const { items, pagination, fetch, create, update, remove } = useNoticesStore(
        useShallow((s) => ({
            items:      s.items,
            pagination: s.pagination,
            fetch:      s.fetch,
            create:     s.create,
            update:     s.update,
            remove:     s.remove,
        }))
    )

    return (
        <CrudPage
            title={t('nav.notices')}
            items={items}
            onFetch={fetch}
            totalPages={pagination.pages}
            onCreate={create}
            onUpdate={update}
            onDelete={remove}
            columns={[
                { key: 'id',      label: t('common.id') },
                { key: 'title',   label: t('common.name'),        sortable: true, filterable: true },
                { key: 'type',    label: t('common.type'),        sortable: true },
                { key: 'content', label: t('common.description') },
            ]}
            formFields={[
                { name: 'title',   label: t('common.name'),        required: true },
                { name: 'content', label: t('common.description'), required: true },
                {
                    name: 'type',
                    label: t('common.type'),
                    type: 'select',
                    options: [
                        { value: 'info',    label: 'Info'    },
                        { value: 'warning', label: 'Warning' },
                        { value: 'urgent',  label: 'Urgent'  },
                    ],
                },
            ]}
        />
    )
}
```

#### Cross-store data (e.g., select options from another resource)

```tsx
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useDepartmentStore from '../../<other-module>/_shared/departments.store'
import type { DepartmentResponse } from '../../../api/generated'

export default function ProgramsPage() {
    const { t } = useI18n()
    const { items, pagination, fetch, create, update, remove } = useProgramStore(
        useShallow((s) => ({ items: s.items, pagination: s.pagination, fetch: s.fetch, create: s.create, update: s.update, remove: s.remove }))
    )

    const { items: departments, fetch: fetchDepartments } = useDepartmentStore(
        useShallow((s) => ({ items: s.items, fetch: s.fetch }))
    )

    // ✅ Compute derived data locally — do NOT put this in a selector function
    const departmentOptions = (departments as DepartmentResponse[]).map(
        (d) => ({ value: d.id, label: `${d.code} - ${d.name}` })
    )

    useEffect(() => { fetchDepartments() }, [fetchDepartments])

    return (
        <CrudPage
            title={t('nav.programs')}
            // ...
            formFields={[
                { name: 'department_id', label: t('common.department'), type: 'select', options: departmentOptions },
            ]}
        />
    )
}
```

#### `Column<T>` props

| Prop | Type | Description |
|------|------|-------------|
| `key` | `keyof T` | Field name from the record |
| `label` | `string` | Column header text — **must use `t(...)`** |
| `sortable?` | `boolean` | Enables sort on this column |
| `filterable?` | `boolean` | Adds a search filter for this column |
| `render?` | `(value, row) => ReactNode` | Custom cell renderer |

#### `FormField` props

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Field name (maps to payload key) |
| `label` | `string` | Label shown in the modal — **must use `t(...)`** |
| `type?` | `'text' \| 'number' \| 'date' \| 'select' \| 'email' \| 'password'` | Input type (default: `'text'`) |
| `required?` | `boolean` | Whether the field is required (default: `true`) |
| `default?` | `string \| number` | Initial value for the create modal |
| `options?` | `{ value, label }[]` | Options list (only for `type: 'select'`) |

### Option B: Custom page

Use when you need multiple tables, complex multi-step forms, or workflows beyond simple CRUD. Reference: `src/modules/profile-general-info/design-system/DesignSystemPage.tsx`.

**Page header:** use the shared `<SectionHeader>` (see *Page layout: spacing & headers* above) — do not re-implement the title/divider markup. When the header needs an inline action button, render it in a flex row beside a plain title block. **No `px-*` on the row** — the Layout already supplies the horizontal margin:

```tsx
<div className="flex items-start justify-between gap-4 mb-4">
    <div>
        <p className="text-[11px] font-bold text-accent tracking-[0.09em] uppercase mb-1">
            {t('common.management')}
        </p>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">
            {t('nav.notices')}
        </h1>
    </div>
    <button
        className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-semibold py-[9px] px-4 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
        onClick={openModal}
    >
        <HiOutlinePlus className="text-[15px]" /> {t('common.addNew')}
    </button>
</div>
```

**Table header — always navy:**

```tsx
<thead>
<tr className="border-b border-bd" style={{ background: 'var(--navy)' }}>
    {[t('common.id'), t('common.name'), t('common.actions')].map((h) => (
        <th key={h} className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
            {h}
        </th>
    ))}
</tr>
</thead>
```

**Error display inside modal forms** — must be the **last child** inside `<form>`:

```tsx
<form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
    {/* fields */}
    {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
            <span>{error}</span>
        </div>
    )}
    <div className="flex gap-2 justify-end border-t border-bd pt-4 mt-2">
        {/* Cancel / Submit buttons */}
    </div>
</form>
```

### Option C: PlaceholderPage (for features not yet implemented)

```tsx
import PlaceholderPage from '../../../infra/shared/pages/PlaceholderPage'
import { HiOutlineChartBar, HiOutlineClipboardDocumentList } from 'react-icons/hi2'

export default function FeaturePlaceholderPage() {
    return (
        <PlaceholderPage
            title="Feature Name"
            role="teacher"
            description="A short paragraph describing what this feature will do when it's built."
            features={[
                { icon: <HiOutlineClipboardDocumentList />, title: "Planned Feature A", description: "One-line description of the first planned capability." },
                { icon: <HiOutlineChartBar />,              title: "Planned Feature B", description: "One-line description of another planned capability." },
            ]}
        />
    )
}
```

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Page title |
| `role` | `'admin' \| 'teacher' \| 'student' \| 'all'` | Role badge color and label |
| `description` | `string` | Short description paragraph |
| `features` | `{ icon, title, description }[]` | Feature cards displayed in a responsive grid |
| `icon?` | `ReactNode` | Optional large icon next to the title |

> Use double-quoted strings in `description` and feature `title`/`description` to avoid apostrophe issues.

### Option D: Settings-style page (no store)

Use for pages that only read from global contexts (auth, theme, i18n) and don't need their own backend data. Reference: `src/modules/settings/{account,appearance,language}/*Page.tsx` — each is a small section page (no store, no API call). Settings was previously a single monolithic page with internal section nav; it has been split into feature folders so `<SubmenuAside>` (desktop) and `<MobileSubmenuTabs>` (mobile) handle the nav automatically.

---

## 8. Step 5 — Wire It Up via `manifest.ts`

This is the only registration step. There is no `menu.config.tsx` to edit.

### Feature manifest

```ts
// src/modules/communication-reporting/notices/manifest.ts
import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import NoticesPage from './NoticesPage'

const manifest: FeatureManifest = {
    i18n: 'nav.notices',
    path: 'notices',                  // RELATIVE — final URL = '/communication-reporting/notices'
    page: NoticesPage,
    permissions: ['form:write'],      // optional — inherits from module if absent
    order: 10,                        // optional — lower = earlier in submenu
}
export default manifest
```

### Module manifest

```ts
// src/modules/billing/manifest.ts
import { HiOutlineCreditCard } from 'react-icons/hi2'
import type { ModuleManifest } from '../../infra/shared/types/permissions'

const manifest: ModuleManifest = {
    i18n: 'nav.billing',
    icon: HiOutlineCreditCard,
    path: '/billing',
    permissions: ['admin:full'],     // optional — any-of permission gate
    order: 95,
    // page: omitted → module redirects to first accessible feature
}
export default manifest
```

### Sidebar rendering rules

A module/feature is **accessible** when the user holds at least one permission matching any of its declared `permissions` patterns. Patterns can be exact (`'user:read'`), prefix-wildcard (`'chat:*'`), or global (`'*'`). Empty/absent `permissions` means public-with-auth.

| Condition | Sidebar behavior |
|---|---|
| Module has `i18n` + `icon` + `path` and user passes the access check | Direct entry in main sidebar (desktop) / bottom nav primary slot or "More" sheet (mobile) |
| Module has `pinBottom: true` | Same as above, but pinned to bottom of the desktop sidebar; folded into the "More" sheet on mobile |
| Module has `children` (any feature manifests) | When user is on that module, `<SubmenuAside>` (desktop) or `<MobileSubmenuTabs>` (mobile) appears in the layout |
| Feature has its own `permissions` | Submenu hides the entry for users who fail the access check |
| Feature has no `permissions` | Inherits from module |
| Module / feature has empty or absent `permissions` | Public — visible to any authenticated user |

### Order rules

- `order: 10, 20, 30, …` — explicit ordering. Use gaps of 10 so you can sip new entries without renumbering.
- Manifests without `order` come last.
- Tie-breaker is alphabetical folder name (deterministic).

### Adding a new sidebar entry — checklist

- [ ] `manifest.ts` exists in the right folder (module level for new modules, feature folder for new features).
- [ ] `i18n` key exists in **both** `en.json` and `ar.json` (`ValidTranslationKeys` is derived from `en.json`; TS will error if the key is missing there).
- [ ] `icon` (module manifests only) imported from `react-icons/hi2` (or `io5`/`md`).
- [ ] `path` is **absolute** for module manifests, **relative** for feature manifests.
- [ ] `permissions` declared if the route should be restricted (omit to inherit from module / make the feature public-with-auth). Patterns can be exact `PermissionCode` literals (TS autocomplete), prefix wildcards (`'chat:*'`), or global wildcard (`'*'`). Roles are no longer used for gating.

---

## 9. Permissions & Type Safety

The frontend gates protected routes by **permission codes** (fine-grained capabilities like `user:read`, `course:write`). Manifest patterns support **wildcards** so a single entry can authorize a whole prefix family.

### `PermissionCode` is auto-generated

```bash
# Backend running on http://localhost:8000
npm run generate-permissions   # → permissions.gen.ts
# or, together with the API client:
npm run generate-types         # runs all three sequentially
```

The scripts hit public no-auth endpoints — `GET /api/v1/access/permission-codes` — and emit TypeScript literal unions:

```ts
// permissions.gen.ts — AUTO-GENERATED
export type PermissionCode =
  | 'user:read'
  | 'user:write'
  | 'course:read'
  | …

```

`src/infra/shared/types/permissions.ts` re-exports both. It also exports `PermissionPattern = PermissionCode | (string & {})` — the type used by manifests.

### Wildcard patterns

In a manifest's `permissions` field, each entry is a `PermissionPattern`:

| Form | Example | Matches |
|---|---|---|
| Exact `PermissionCode` | `'user:read'` | only `user:read` |
| Prefix wildcard | `'chat:*'` | any code starting with `chat:` (`chat:read`, `chat:write`, …) |
| Global wildcard | `'*'` | every authenticated user (effectively public) |

The wildcard lives **only on the manifest side**. User permissions remain concrete codes in `userPerms: ReadonlySet<PermissionCode>`. The matcher in `canAccess` compares each pattern against each user permission.

> Re-run `npm run generate-permissions` whenever the backend's `permissions.py` registry changes. A typo on an exact pattern such as `'usre:read'` becomes a compile-time error (TypeScript autocomplete is your safety net) — but wildcard strings like `'chat:*'` are accepted as plain strings, so double-check the prefix.

### Reading permissions inside a component

```tsx
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'

const userPerms = useAuthStore(selectUserPermissions)  // ReadonlySet<PermissionCode>
const canDeleteUsers = userPerms.has('user:write')

return <CrudPage onDelete={canDeleteUsers ? remove : undefined} … />
```

`userPerms` is a stable `ReadonlySet` — safe as a dependency-array key and as a Zustand selector return value without breaking `getSnapshot` identity. **Use permissions for every gating decision** (in-page actions, route guards, sidebar visibility).

### Auth store shape

```ts
interface AuthState {
  user:        UserResponse | null
  loading:     boolean
  permissions: ReadonlySet<PermissionCode>
  // actions: initialize, login, register, logout
}
```

`initialize()` (called once on app boot) and `login()` both populate `permissions` from `GET /api/v1/auth/me/permissions`. `logout()` resets both to stable empty `Set`s.

---

## 10. Step 6 — Add i18n Translations

Translation files live in `src/infra/locales/`. **Always update both files simultaneously.**

### File structure

Both `en.json` and `ar.json` share the same key structure:

```
nav.*           — navigation labels (sidebar/submenu items, page titles)
common.*        — reusable labels (id, name, code, actions, management, …)
auth.*          — login/logout strings
placeholder.*   — PlaceholderPage component strings
dashboard.*     — dashboard page strings
settings.*      — settings page strings
```

### Adding new keys

**`src/infra/locales/en.json`:**
```json
{
  "nav": { "notices": "Notices" },
  "notices": { "noNotices": "No notices found" }
}
```

**`src/infra/locales/ar.json`:**
```json
{
  "nav": { "notices": "الإشعارات" },
  "notices": { "noNotices": "لا توجد إشعارات" }
}
```

### Using translations

```tsx
import { useI18n } from '../../../infra/locales/I18nContext'
import type { ValidTranslationKeys } from '../../../infra/locales/I18nContext'
const tk = (k: string) => k as ValidTranslationKeys

export default function NoticesPage() {
    const { t } = useI18n()
    return <h1>{t('nav.notices')}</h1>
}
```

### Type safety

`ValidTranslationKeys` is derived from `en.json` via `FlattenKeys<T>`. It accepts dot-notation paths to any leaf value. If a key doesn't exist in `en.json`, TypeScript errors. **Always add the key to `en.json` first.**

---

## 11. Theme & Design System

### Always use CSS variables — never hardcode colors

The app supports light and dark mode via `data-theme="light|dark"` on `<html>`. All colors are CSS custom properties.

```tsx
// GOOD
<div className="bg-surface text-primary border border-bd" />
<th style={{ background: 'var(--navy)' }} />

// BAD — breaks dark mode
<div style={{ background: '#ffffff', color: '#0f172a' }} />
```

### Tailwind color tokens

| Token | Light value | Dark value | Use for |
|-------|-------------|------------|---------|
| `bg-bg` | `#ECF0F6` | `#0B1221` | Page background |
| `bg-surface` | `#FFFFFF` | `#131D2E` | Cards, modals, panels |
| `bg-surface-2` | `#F5F7FA` | `#192438` | Input backgrounds, row hover |
| `text-primary` | `#0D1B2A` | `#EEF2F8` | Body text, headings |
| `text-secondary` | `#4A5568` | `#8A97B0` | Supporting text |
| `text-muted` | `#8A97AA` | `#546070` | Placeholders, meta info |
| `text-accent` | `#06555C` | `#2DD4BF` | Accent text, active states |
| `bg-accent` | `#06555C` | `#2DD4BF` | Primary action buttons |
| `bg-accent-light` | `rgba(6,85,92,0.09)` | `rgba(45,212,191,0.09)` | Subtle accent backgrounds |
| `border-bd` | — | — | All borders (use `border-bd` in Tailwind) |

### Special CSS variables (use with inline `style`)

| Variable | Use |
|----------|-----|
| `var(--navy)` | Table `<thead>` background, dark card headers |
| `var(--navy-mid)` | Gradient end: `linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)` |
| `var(--accent)` | Primary brand color |
| `var(--accent-light)` | Subtle accent tint |
| `var(--accent-dark)` | Darker accent — gradient end stop |
| `var(--border)` | Border color (same as `border-bd` token) |
| `var(--sidebar-gradient)` | Sidebar / mobile bottom-nav background gradient |

### Semantic status colors

For success / danger / warning UI (action buttons, alerts, status text), use these tokens — **never hardcode hex** like `#059669` or `#DC2626`:

| Variable | Use |
|----------|-----|
| `var(--success)` | Success solid — confirm / approve / resolve buttons, positive text |
| `var(--success-light)` | Success tint — subtle success backgrounds |
| `var(--danger)` | Danger solid — destructive / decline buttons, error text |
| `var(--danger-light)` | Danger tint — subtle error backgrounds |
| `var(--danger-glow)` | Stronger danger tint — hover state on soft danger buttons |
| `var(--warning)` | Warning solid — amber accents |
| `var(--warning-light)` | Warning tint |

Apply them via inline `style` (`style={{ background: 'var(--danger)' }}`) or as Tailwind arbitrary values (`className="text-[var(--danger)]"`). For multi-status colors, the `Record<status, {bg,text}>` lookup pattern below is the one allowed place to keep literal `rgba()` values.

### ⚠️ Use the real variable names

Only the variables documented in this section exist. A typo resolves to nothing and silently breaks the color. Common mistakes already found and fixed in this codebase:

| ❌ Wrong (does not exist) | ✅ Correct |
|---|---|
| `var(--text)` | `var(--text-primary)` (or the `text-primary` token) |
| `var(--text-2)` | `var(--text-secondary)` / `var(--text-muted)` |
| `var(--surface-1)` | `var(--surface)` / `var(--surface-2)` |

### Utility classes

| Class | Description |
|-------|-------------|
| `.card` | Standard panel: `bg-surface border border-bd rounded-[14px] shadow-sm` |
| `.thin-scrollbar` | Sidebar (dark) — fully hidden scrollbar; content still scrolls via wheel |
| `.thin-scrollbar-light` | Content panels — hover-reveal thin scrollbar (track transparent until container is hovered) |
| `.nav-btn` | Sidebar nav button — `flex-direction: column`, icon on top, label below |
| `.sidebar-active-indicator` | Single moving accent bar at sidebar root that translates between active items (animated) |
| `.bottom-nav-indicator` | Mobile bottom-nav equivalent — slides horizontally between active tabs |
| `.submenu-active-pill` | SubmenuAside (desktop) sliding pill background for the active feature |
| `.mobile-submenu-pill` | MobileSubmenuTabs (mobile) sliding pill, horizontal axis |

### Reading / toggling the theme in code

```tsx
import { useTheme } from '../../../infra/theme/ThemeContext'
const { theme, toggleTheme } = useTheme()
```

### Status badge pattern — never build dynamic Tailwind classes

```ts
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    enrolled:  { bg: 'rgba(59,130,246,0.1)',  text: '#2563EB' },
    completed: { bg: 'rgba(34,197,94,0.1)',   text: '#16A34A' },
    dropped:   { bg: 'rgba(245,158,11,0.1)',  text: '#D97706' },
    failed:    { bg: 'rgba(220,38,38,0.1)',   text: '#DC2626' },
}

function StatusBadge({ status }: { status: string }) {
    const c = STATUS_COLORS[status] ?? { bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
    return (
        <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
            style={{ background: c.bg, color: c.text }}
        >
            {status}
        </span>
    )
}

// BAD — Tailwind will NOT generate this at build time
const badgeClass = `bg-${status}-100 text-${status}-700`
```

---

## 12. Permission-Based Access

Backend defines permission codes in `backend/app/core/permissions.py`. They flow through the frontend via the auto-generated `permissions.gen.ts`.

### How access control works

- **Module manifest `permissions`** — restricts the entire module. Sidebar entry hidden, route guarded.
- **Feature manifest `permissions`** — restricts that specific feature. If absent, **inherits from the module**.
- The route layer wraps each page in `<PermissionGuard>` automatically when `permissions` is non-empty. Users who fail the check are redirected to `/unauthorized`.
- For modules without a `page`, `<ModuleRedirect>` finds the first feature the current user can access; otherwise redirects to `/unauthorized`.
- The check is **any-of pattern match**: a route is reachable if any listed `PermissionPattern` matches any of the user's permissions. `canAccess` (in `menuUtils.ts`) implements pattern → permission matching with wildcard support.
- A route with empty/absent `permissions` is **public-with-auth** (visible to any authenticated user).

### Wildcard patterns

```ts
permissions: ['user:read']      // exact: only `user:read` users
permissions: ['chat:*']         // any user with chat:read, chat:write, chat:moderate, …
permissions: ['admin:*']        // any user with an admin:* permission (e.g. admin:full)
permissions: ['*']              // any authenticated user
permissions: ['user:read', 'admin:*']  // OR — user:read OR any admin:*
```

### Inheritance example

```ts
// users-management/manifest.ts
{ path: '/users', permissions: ['user:read'], … }

// users-management/audit-log/manifest.ts
{ path: 'audit-log', permissions: ['audit:read'], … }    // overrides

// users-management/admin-tools/manifest.ts
{ path: 'admin-tools', permissions: ['admin:*'], … }     // overrides with wildcard

// users-management/list/manifest.ts
{ path: 'list', … }                                       // inherits → ['user:read']
```

### Checking access inside a component

```tsx
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'

const userPerms = useAuthStore(selectUserPermissions)

return (
  <CrudPage
    onDelete={userPerms.has('user:write') ? remove : undefined}
    …
  />
)
```

For wildcard checks against user permissions inside a component, iterate or use the `canAccess` helper directly — though usually exact `userPerms.has('foo:write')` is what you want.

> Backend remains the source of truth — the UI mirrors permissions but cannot grant them. If a user manages to call a guarded endpoint without the right code, the API will respond with 403 regardless of UI state.

---

## 13. Error Handling Rules

### Helper functions (`src/infra/shared/utils/apiError.ts`)

```ts
throwIfError(error: unknown): void
extractErrorMessage(error: unknown): string
```

`extractErrorMessage` handles these backend error formats in order:
1. `{ error: { message } }` — JAI School custom format
2. `{ detail: "string" }` — FastAPI default
3. `{ detail: [{ msg }] }` — FastAPI validation errors
4. `{ message: "string" }` — generic JS error
5. Falls back to `"An unexpected error occurred"`

### Rules

1. **Always call `throwIfError(error)` after every mutating API call** (create, update, delete).
2. **Do not call `throwIfError` on reads** — a failed read should silently leave the list empty.
3. **`CrudPage` handles errors automatically** — wraps `onCreate`/`onUpdate`/`onDelete` in try/catch and displays the error inside the modal.
4. **Custom modal pages** — wrap the submit handler in try/catch:

```tsx
const [error, setError] = useState<string | null>(null)

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
        await create(payload)
    } catch (err: any) {
        setError(err?.message || 'An unexpected error occurred')
    }
}
```

---

## 14. Zustand Patterns & Best Practices

### ⚡ Always Use `useShallow` in Page Components

```tsx
import { useShallow } from 'zustand/react/shallow'

// ❌ WRONG — causes infinite render loop
const items  = useMyStore((s) => s.items)
const fetch  = useMyStore((s) => s.fetch)

// ✅ CORRECT — single useShallow call
const { items, fetch } = useMyStore(
    useShallow((s) => ({ items: s.items, fetch: s.fetch }))
)
```

### ⚠️ Derived data: compute locally, not in selectors

```tsx
// ✅ GOOD
const { items } = useSomeStore(useShallow((s) => ({ items: s.items })))
const options = items.map((d) => ({ value: d.id, label: d.name }))

// ❌ BAD — selector creates a new reference every call → infinite loop
export const selectOptions = (state) => state.items.map((d) => ({ value: d.id, label: d.name }))
```

### Standard state key names

| Key | Type | Description |
|-----|------|-------------|
| `items` | `T[]` | Current page records |
| `pagination` | `Pagination` | `{ total, page, page_size, pages }` |
| `fetchParams` | `SortFilterParams` | Last sort/filter state |
| `fetch` | `Function` | Load data |
| `create` | `Function` | Create record |
| `update` | `Function` | Update record |
| `remove` | `Function` | Delete record |

### Store checklist

- [ ] `import '../../../api/client'` is the **first** import in store files
- [ ] `import { useShallow } from 'zustand/react/shallow'` at the top of every page file
- [ ] All `useStore()` calls use `useShallow` wrapper
- [ ] No multiple individual `useStore((s) => s.x)` calls
- [ ] Derived data computed locally in component
- [ ] Mutations call `throwIfError(error)` before re-fetching
- [ ] Re-fetch uses `get().fetch(get().pagination.page)` to stay on current page
- [ ] `Pagination`, `extractPaged`, `buildQuery` imported from `storeHelpers.ts`, never copied

---

## 15. Complete Example — Notices Feature

Full walkthrough: admin-only notices with title, content, type. Lives inside `communication-reporting`.

### Assumed API endpoints

```
GET    /api/v1/admin/notices        → list (paginated)
POST   /api/v1/admin/notices        → create
PUT    /api/v1/admin/notices/{id}   → update
DELETE /api/v1/admin/notices/{id}   → delete
```

### 1. Generate the API client

```bash
npm run generate-api
```

### 2. `src/modules/communication-reporting/notices/store.ts`

```ts
import '../../../api/client'
import {
    listNoticesApiV1AdminNoticesGet              as listNotices,
    createNoticeApiV1AdminNoticesPost            as createNoticeApi,
    updateNoticeApiV1AdminNoticesNoticeIdPut     as updateNoticeApi,
    deleteNoticeApiV1AdminNoticesNoticeIdDelete  as deleteNoticeApi,
} from '../../../api/generated'
import type { NoticeResponse } from '../../../api/generated'
import { createCrudStore } from '../../../infra/shared/utils/createCrudStore'

const useNoticesStore = createCrudStore<NoticeResponse>({
    listApi:   listNotices,
    createApi: (args) => createNoticeApi(args),
    updateApi: (args) => updateNoticeApi(args),
    deleteApi: (args) => deleteNoticeApi(args),
    idPath:    (id) => ({ notice_id: id }),
})

export default useNoticesStore
```

### 3. `src/modules/communication-reporting/notices/NoticesPage.tsx`

```tsx
import { useShallow } from 'zustand/react/shallow'
import CrudPage from '../../../infra/shared/components/CrudPage'
import useNoticesStore from './store'
import { useI18n } from '../../../infra/locales/I18nContext'

export default function NoticesPage() {
    const { t } = useI18n()
    const { items, pagination, fetch, create, update, remove } = useNoticesStore(
        useShallow((s) => ({
            items:      s.items,
            pagination: s.pagination,
            fetch:      s.fetch,
            create:     s.create,
            update:     s.update,
            remove:     s.remove,
        }))
    )

    return (
        <CrudPage
            title={t('nav.notices')}
            items={items}
            onFetch={fetch}
            totalPages={pagination.pages}
            onCreate={create}
            onUpdate={update}
            onDelete={remove}
            columns={[
                { key: 'id',      label: t('common.id') },
                { key: 'title',   label: t('common.name'),        sortable: true, filterable: true },
                { key: 'type',    label: t('common.type'),        sortable: true },
                { key: 'content', label: t('common.description') },
            ]}
            formFields={[
                { name: 'title',   label: t('common.name'),        required: true },
                { name: 'content', label: t('common.description'), required: true },
                {
                    name: 'type',
                    label: t('common.type'),
                    type: 'select',
                    options: [
                        { value: 'info',    label: 'Info'    },
                        { value: 'warning', label: 'Warning' },
                        { value: 'urgent',  label: 'Urgent'  },
                    ],
                },
            ]}
        />
    )
}
```

### 4. `src/modules/communication-reporting/notices/manifest.ts`

```ts
import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import NoticesPage from './NoticesPage'

const manifest: FeatureManifest = {
    i18n: 'nav.notices',
    path: 'notices',                   // joined with module path → '/communication-reporting/notices'
    page: NoticesPage,
    permissions: ['form:write'],       // pick the closest backend permission; admin holds all of them
    order: 10,
}
export default manifest
```

### 5. Add translations

**`src/infra/locales/en.json`** — add under `"nav"`:
```json
{ "nav": { "notices": "Notices" } }
```

**`src/infra/locales/ar.json`** — add under `"nav"`:
```json
{ "nav": { "notices": "الإشعارات" } }
```

### 6. Verification checklist

- [ ] `npm run build` passes (type-check + Vite)
- [ ] Submenu shows **Notices** when a user holding `form:write` lands on `/communication-reporting`
- [ ] Submenu hides Notices for users without that permission
- [ ] Direct URL `/communication-reporting/notices` redirects users without `form:write` to `/unauthorized`
- [ ] Create button opens modal; submitting adds a record
- [ ] Backend validation errors display inside the modal
- [ ] Edit opens modal pre-filled; saving updates the record
- [ ] Delete asks for confirmation; confirming removes the record
- [ ] Sorting by Title works; filtering by Title works
- [ ] Pagination works with more than 20 records
- [ ] Light/dark mode toggle — page looks correct in both themes
- [ ] Switch to Arabic — sidebar label reads "الإشعارات", all labels translate, layout flips RTL

---

## Icon Reference

Module icons currently come from `react-icons/hi2` (Heroicons Outline 2), with a few from `react-icons/io5` and `react-icons/md`.

> **Sizing icons.** Menus and components size icons via a `className` font-size (e.g. `<Icon className="text-[22px]" />`) — react-icons SVGs are `1em`, so they scale with it. A **custom icon component** that implements `IconType` (e.g. an icon with a notification badge) must behave the same way: default its size to `'1em'`, never to a hardcoded pixel value. A fixed-px default makes the icon ignore the size its container asked for.

| Module | Icon |
|--------|------|
| Dashboard | `HiOutlineSquares2X2` |
| Schedule / Calendar | `HiOutlineCalendarDays` |
| User Management / Admin | `HiOutlineUsers` |
| Course Management | `IoBookOutline` (from `react-icons/io5`) |
| Assignments | `HiOutlineClipboardDocumentList` |
| Grading / Grades | `HiOutlineChartBarSquare` |
| Communication | `HiOutlineChatBubbleLeftRight` |
| Dynamic Forms | `MdOutlineDynamicForm` (from `react-icons/md`) |
| Profile / General Info | `HiOutlineUserCircle` |
| Settings | `HiOutlineCog6Tooth` |
| External Link | `HiOutlineGlobeAlt` |
| Departments | `HiOutlineBuildingOffice2` |
| Programs | `HiOutlineAcademicCap` |
| Courses | `HiOutlineBookOpen` |
| Students | `HiOutlineUserGroup` |
| Sections | `HiOutlineRectangleGroup` |
| Attendance | `HiOutlineClipboardDocumentList` |
| Enrollments | `HiOutlineClipboardDocumentCheck` |
| Design System | `HiOutlinePaintBrush` |
| Notices | `HiOutlineBellAlert` |
| Library | `HiOutlineBookmarkSquare` |
