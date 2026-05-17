⚠️ Mandatory: AI agents must read this file before writing or modifying any code.

MANDATORY: After completing each task, update this repo's AGENTS.md Task Log (newest-first) before marking the task done.
This file complements the workspace-level Ansiversa-workspace/AGENTS.md (source of truth). Read workspace first.

# AGENTS.md
## School Repo - Session Notes

This repo contains the School Ansiversa mini-app.

---

## 1. Current Architecture

- Astro mini-app initialized from the current Ansiversa `app-starter` baseline.
- App identity source: `src/app.meta.ts`.
- App key: `school`.
- App name: `School`.
- Production domain: `https://school.ansiversa.com`.
- Auth is owned by the parent Ansiversa app and validated through the standard shared session/JWT middleware.
- Public landing route: `/`.
- Protected workspace route: `/app`.
- Shared UI comes from `@ansiversa/components`.
- Client behavior follows the one global Alpine store pattern.

---

## 2. Current Scope

School currently includes DB Foundation V1 only.

Allowed V1 foundation records:

- School organization owned by the logged-in Ansiversa user
- Academic years schema
- Classes
- Sections
- Subjects
- Students
- Teachers

Do not add full school modules without approval:

- Attendance
- Fees
- Exams
- Report cards
- Transport
- Library
- Hostel
- Communication
- Student login
- Teacher login
- Parent portal
- School-specific database tables
- Fake/demo school data
- Stripe or billing changes

---

## 3. Database

- Remote DB URL: `libsql://school-ansiversa.aws-ap-south-1.turso.io`.
- Secrets must stay in local/uncommitted env files or deployment environment variables.
- `db/config.ts` defines School DB Foundation V1 tables only.
- Every school-owned table is scoped by `schoolId`.
- Owner-level access must resolve `SchoolOrganizations.ownerUserId` first.

---

## 4. Task Log (Recent)

- 2026-05-17 Implemented School Foundation Edit/Delete Polish V1: Classes, Sections, Subjects, Students, and Teachers now support drawer-based edit flows and confirmed delete actions with owner/school-scoped server guards, preserved relationship validation, and refreshed lists after writes. Updated `docs/app-spec.md` for foundation edit/delete support. Verification: `npm run typecheck` passed (0 errors, 5 existing redirect-page hints) and `npm run build` passed.

- 2026-05-17 Polished the School Foundation tab layout: kept each tab description directly under its left-aligned title while preserving the action button, and changed foundation record lists to a responsive three-column card grid on desktop widths. Verification: `npm run typecheck` passed (0 errors, 5 existing redirect-page hints) and `npm run build` passed.

- 2026-05-17 Refactored School Foundation tab layout from two-column tab panels to stacked Ansiversa section cards: each Classes, Sections, Subjects, Students, and Teachers tab now has a header/action card followed by a separate list/empty-state card while preserving existing drawer create behavior. Verification: `npm run typecheck` passed (0 errors, 5 existing redirect-page hints) and `npm run build` passed.

- 2026-05-17 Refactored all School Foundation create forms into Ansiversa drawer flows: removed inline create forms from Classes, Sections, Subjects, Students, and Teachers tabs; added compact tab intro/action surfaces; moved existing fields into drawer forms with validation, double-submit protection, list refresh, reset-on-success, success close, cancel behavior, and visible drawer errors. Verification: `npm run typecheck` passed (0 errors, 5 existing redirect-page hints) and `npm run build` passed.

- 2026-05-17 Refactored School Organization setup on `/app` to follow Ansiversa Drawer UX Standard: replaced the inline setup form with a readable organization summary/empty state card, moved create/edit fields into drawer flows with validation, cancel/close, double-submit protection, success close, and visible drawer errors. Verification: `npm run typecheck` passed (0 errors, 5 existing redirect-page hints) and `npm run build` passed.

- 2026-05-17 Added School DB Foundation V1: created owner-scoped school organization, academic year, class, section, subject, student, and teacher tables; added safe Astro actions for create/list foundation records; replaced `/app` placeholder with a minimal owner workspace for setup and master records; documented scope/exclusions in `docs/app-spec.md`. Verification: `npm run typecheck` passed (0 errors, 5 existing redirect-page hints), `npm run build` passed, and `npm run db:push` applied the remote School Turso schema.

- 2026-05-17 Initialized School Ansiversa from the current `app-starter` baseline: copied the baseline into the empty `school` repo, updated app/package/UI identity to School, configured local `.env` for the School Turso DB without committing secrets, preserved the standard parent-auth `/` + `/app` architecture, and kept the foundation free of school modules/tables/demo data. Verification: `npm install` completed (27 npm audit findings reported), `npm run typecheck` passed (0 errors, 5 existing redirect-page hints), and `npm run build` passed.

- Keep newest first; include date and short summary.
