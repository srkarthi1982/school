# Contributing to School Ansiversa

School Ansiversa follows the workspace-level Ansiversa architecture contract.

## Scope Rules

- Keep parent authentication, shared sessions, users, roles, and billing in the parent app.
- Keep this repo focused on School app-domain behavior.
- Do not add students, teachers, attendance, fees, school tables, or fake demo data without approval.
- Use `@ansiversa/components` and the existing AppShell/middleware patterns.
- Keep client behavior in the global Alpine store pattern.
- Use Astro actions and SSR-first flows for future work.

## Before Finishing Work

1. Read the workspace `AGENTS.md`.
2. Read this repo `AGENTS.md`.
3. Run the relevant verification commands.
4. Update the repo `AGENTS.md` task log.
