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

School is currently a clean foundation only.

Do not add school modules without approval:

- Students
- Teachers
- Attendance
- Fees
- School-specific database tables
- Fake/demo school data
- Stripe or billing changes

---

## 3. Database

- Remote DB URL: `libsql://school-ansiversa.aws-ap-south-1.turso.io`.
- Secrets must stay in local/uncommitted env files or deployment environment variables.
- `db/config.ts` currently defines no app tables.

---

## 4. Task Log (Recent)

- 2026-05-17 Initialized School Ansiversa from the current `app-starter` baseline: copied the baseline into the empty `school` repo, updated app/package/UI identity to School, configured local `.env` for the School Turso DB without committing secrets, preserved the standard parent-auth `/` + `/app` architecture, and kept the foundation free of school modules/tables/demo data. Verification: `npm install` completed (27 npm audit findings reported), `npm run typecheck` passed (0 errors, 5 existing redirect-page hints), and `npm run build` passed.

- Keep newest first; include date and short summary.
