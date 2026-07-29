Ask the user for three values

1. **target_module** — which existing module this feature belongs to. Pick one of:
   - `access-management` — roles & permissions admin (gated by `admin:*`)
   - `users-management` — admin user CRUD (gated by `admin:full`)
   - `dynamic-forms` — dynamic form builder (gated by `admin:full`)
   - `profile-general-info` — landing page for teacher / student (gated by `teacher:read`, `student:read`)
   - `dashboard-scheduling` — dashboard & personal schedule (gated by `schedule_entry:*`)
   - `course-management` — course-level features (gated by `student:*`, `teacher:*`)
   - `assignment-assessment` — quiz bank & assessment (gated by `quiz:*`)
   - `grading-attendance` — grading, attendance, grades (gated by `teacher:*`, `student:*`)
   - `communication-reporting` — chat, requests, FAQ, IT support, virtual classroom (gated by `teacher:*`, `student:*`)
   - `external-link` — external integrations (gated by `teacher:*`, `student:*`)
   - `settings` — pinned-bottom settings page (public)

   If none fits, ask whether to create a brand-new module — see "Creating a new module" at the bottom.

2. **feature_name** — kebab-case name for the feature folder (e.g. `notices`, `lesson-plan`). Used as the folder name inside the module **and** as the URL segment appended to the module's path.

3. **PageName** — PascalCase component name for the page (e.g. `NoticesPage`, `LessonPlanPage`). Used as the `.tsx` filename.

---

Read the guidelines

Open `frontend/CONTRIBUTING.md` and follow the project's coding conventions: module-structure rules (Section 3), store setup (Section 6), page patterns + `useShallow` rule + i18n rule (Section 7), manifest registration (Section 8), permissions & type safety (Section 9), permission-based access (Section 12), theme tokens (Section 11).

---

Know the shared utilities (`src/infra/shared/`)

```
src/infra/shared/
├── components/
│   ├── CrudPage.tsx        ← Generic CRUD table + modal (list/create/update/delete with sorting, filtering, pagination)
│   ├── Layout.tsx          ← App shell (main sidebar + auto-rendered SubmenuAside + content area)
│   ├── SidebarMenu.tsx     ← Main sidebar (one entry per module)
│   ├── SubmenuAside.tsx    ← In-page submenu, rendered automatically by Layout when the active module has features
│   ├── ModuleRedirect.tsx  ← Used at module.path when the module manifest has no `page`
│   ├── ProtectedRoute.tsx  ← Redirects unauthenticated users to /login
│   ├── PermissionGuard.tsx ← Redirects users lacking required permissions to /unauthorized
│   ├── ErrorBoundary.tsx   ← React error boundary wrapper
│   └── Paginator.tsx       ← Pagination navigation
├── pages/
│   ├── PlaceholderPage.tsx ← "Coming soon" placeholder with role badge + feature cards
│   ├── UnauthorizedPage.tsx
│   └── NotFoundPage.tsx
├── types/
│   ├── permissions.ts      ← PermissionCode (re-export), PermissionPattern, AccessRequirement, MenuItem, SubMenuItem, ModuleManifest, FeatureManifest
│   └── permissions.gen.ts  ← AUTO-GENERATED — PermissionCode literal union (do not edit by hand)
└── utils/
    ├── apiError.ts         ← throwIfError() + extractErrorMessage()
    ├── createCrudStore.ts  ← Factory: full CRUD Zustand store in ~15 lines
    ├── menuUtils.ts        ← canAccess() (any-of pattern match w/ wildcards), flattenRoutes(), filterMenuForSidebar(), findActiveModule(), joinPath()
    └── storeHelpers.ts     ← Pagination type, extractPaged(), buildQuery()
```

Usage rules:
- **CRUD page** → use `CrudPage`
- **Coming soon route** → use `PlaceholderPage`
- **API errors** → always use `throwIfError()` and `extractErrorMessage()` from `apiError.ts`
- **Store pagination/query helpers** → import from `storeHelpers.ts`, never copy-paste
- **Pages must not render their own submenu sidebar/tabs** — the layout owns it and renders `<SubmenuAside>` (desktop) / `<MobileSubmenuTabs>` (mobile) automatically based on `MENU_CONFIG`
- **Permission patterns** → exact `PermissionCode` (TS autocomplete) or wildcard string (`'chat:*'`, `'*'`). Gating is by permission only — there is no role-based gating.

---

Create the folder structure

```
frontend/src/modules/{target_module}/
└── {feature_name}/
    ├── manifest.ts             ← feature manifest (registers route + submenu entry)
    ├── {PageName}.tsx          ← page component
    └── store.ts                ← store exclusive to this page
```

Feature-folder rules:
- Each page lives in its own kebab-case folder; the store is `store.ts` inside that folder, imported via `from './store'`.
- If the store will be consumed by more than one page later, promote it: move `{feature}/store.ts` → `{module}/_shared/{name}.store.ts` and update both importers.

---

What you have to implement

**a. store file (mock, no real API)**

Zustand store with static / mock data only. Follow the factory pattern in `CONTRIBUTING.md` Section 6 when the shape fits CRUD; otherwise use a manual `create()` store. Do not call real endpoints and do not import from `src/api/generated` — the data must be hardcoded inline.

**b. page component**

Create `frontend/src/modules/{target_module}/{feature_name}/{PageName}.tsx`:
- Import the mock store and read its data via `useShallow` (see `CONTRIBUTING.md` Section 7 — this is the #1 runtime-error source; the rule is mandatory).
- Use `useI18n()` for every visible string — no hardcoded English or Arabic. Add keys to both `src/infra/locales/en.json` and `src/infra/locales/ar.json`.
- Build a simple UI mock-up (card / table / form) so the page can be opened and viewed. Reference `frontend/src/modules/profile-general-info/design-system/DesignSystemPage.tsx` for design tokens (colors, spacing, typography).
- **Page root must not add padding, margin, or `max-w-*`** — `Layout` already supplies the standard page margin. Make the root a bare `<div>` / `<div className="flex flex-col gap-*">` (see `CONTRIBUTING.md` Section 7, *Page layout: spacing & headers*). Per-page root padding is what caused the inconsistent margins this project has had to fix repeatedly.
- For the page title, use the shared `<SectionHeader>` (`src/infra/shared/components/SectionHeader.tsx`) — `icon` + `title` + optional `description`. Never hand-roll the title markup or copy it per module.
- Use Tailwind tokens (`bg-surface`, `text-primary`, `border-bd`, `text-accent`) and CSS vars (`var(--navy)`, `var(--accent)`, `var(--success)`, `var(--danger)`) — never hardcode hex colors. Use only the variables documented in `CONTRIBUTING.md` Section 11 (e.g. `--text-primary`, **not** `--text`).
- Do **not** add an `<aside>` for submenu navigation — `Layout` renders the submenu automatically from the module's manifests.

**c. feature manifest**

Create `frontend/src/modules/{target_module}/{feature_name}/manifest.ts`:

```ts
import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import {PageName} from './{PageName}'

const manifest: FeatureManifest = {
    i18n: 'nav.{feature_name}',
    path: '{feature_name}',          // RELATIVE — joined with the module's absolute path
    page: {PageName},
    permissions: [...],              // optional — any-of pattern match. Exact codes or wildcards (see below).
    order: NN,                       // optional — lower = earlier (use gaps of 10)
}
export default manifest
```

- Add the i18n key `nav.{feature_name}` to **both** `en.json` and `ar.json`. TypeScript will error if you use `t('nav.{feature_name}')` without adding it to `en.json` first (`ValidTranslationKeys` is derived from `en.json`).
- Pick `order` so the new feature appears where you want in the submenu — leave gaps so future inserts don't require renumbering existing manifests.
- **Access gating** uses `permissions` only. Each entry is a `PermissionPattern`:
  - **Exact `PermissionCode`** — e.g. `'user:read'`, `'course:write'`, `'admin:full'`. TypeScript autocomplete suggests these; typos error.
  - **Prefix wildcard** — e.g. `'chat:*'` matches any user with a `chat:`-prefixed permission (`chat:read`, `chat:write`, …). Useful for "any user with capability in this domain".
  - **Global wildcard** — `'*'` matches every authenticated user (effectively public-with-auth).
  - Multiple patterns are OR-combined (any match passes).
  - Omit `permissions` (or set to `[]`) to inherit from the parent module; if the module is also unrestricted, the route is public-with-auth.

**No `menu.config.tsx` edits are needed.** The generator at `src/infra/config/menu.config.tsx` auto-discovers every `manifest.ts` via `import.meta.glob` and rebuilds `MENU_CONFIG`.

---

Creating a brand-new module

If no existing module fits, create `frontend/src/modules/{new_module}/manifest.ts` first:

```ts
import { HiOutlineSomething } from 'react-icons/hi2'
import type { ModuleManifest } from '../../infra/shared/types/permissions'

const manifest: ModuleManifest = {
    i18n: 'nav.{new_module}',
    icon: HiOutlineSomething,
    path: '/{new_module}',           // ABSOLUTE
    permissions: [...],              // optional — any-of pattern match (PermissionCode literals or wildcards like 'chat:*')
    order: NN,                       // optional
    // page: omitted → module redirects to first accessible feature
    // pinBottom: true,              // optional — pin to bottom of sidebar / fold into mobile "More" sheet (used by settings)
}
export default manifest
```

Then add the first feature folder beneath it as described above. Pick an icon from `react-icons/hi2` (or `io5`/`md`) — see the Icon Reference table at the bottom of `CONTRIBUTING.md`.

---

No backend connection needed for the mock — the store is hardcoded; you do not need to run `npm run generate-api`. **However**, if you reference a permission code that hasn't been generated yet, run `npm run generate-permissions` (backend must be running) so the `PermissionCode` union is current. Or run both generators at once with `npm run generate-types`.

---

Final verification

- `npm run build` passes (type-check + Vite). A typo in `permissions: ['usre:read']` will fail this step — that is the safety net.
- Visit `/{target_module}` — the submenu shows the new feature, and clicking it opens the page.
- Direct URL `/{target_module}/{feature_name}` works and is access-guarded (users whose permissions don't match any listed pattern are redirected to `/unauthorized`).
- i18n works in both English and Arabic; layout flips correctly in RTL.
- Light/dark theme toggle doesn't break the page styling.
- Page margins line up with other pages — the root element adds no `px-*` / `py-*` / `max-w-*`, and the title uses the shared `<SectionHeader>`.
- Open the route in a mobile viewport (<1024px): the bottom nav and submenu tabs render correctly; content is not clipped by the fixed bottom nav.
