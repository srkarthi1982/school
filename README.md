# School Ansiversa

School Ansiversa is the clean foundation for a school management backend covering owners, admins, academics, attendance, and fees.

This repo is initialized from the standard Ansiversa mini-app baseline. It currently provides the platform foundation only: shared layout, parent authentication/session validation, a public landing page at `/`, and a protected workspace at `/app`.

## Current Scope

This foundation does not yet include students, teachers, attendance, fees, school tables, fake school data, Stripe, or billing work.

## App Identity

- App key: `school`
- App name: `School`
- Production domain: `https://school.ansiversa.com`
- Remote DB: `libsql://school-ansiversa.aws-ap-south-1.turso.io`

## Quick Start

1. Install dependencies.

```sh
npm install
```

2. Configure env vars in local `.env` or deployment settings. Keep secrets out of committed files.

```sh
ASTRO_DB_REMOTE_URL=libsql://school-ansiversa.aws-ap-south-1.turso.io
ASTRO_DB_APP_TOKEN=...
ANSIVERSA_AUTH_SECRET=...
ANSIVERSA_SESSION_SECRET=...
ANSIVERSA_COOKIE_DOMAIN=localhost
PARENT_APP_URL=http://localhost:2000
ANSIVERSA_WEBHOOK_SECRET=...
```

3. Run the app.

```sh
npm run dev
```

## Commands

- `npm run dev`
- `npm run typecheck`
- `npm run build`
- `npm run db:push`

## Architecture Contract

- Parent Ansiversa owns authentication, users, roles, and shared account behavior.
- School stores only app-domain data after future approved module work.
- Use `@ansiversa/components` for shared UI.
- Keep the global Alpine store pattern.
- Use Astro actions and SSR-first behavior for future workflows.
- Always update `AGENTS.md` before completing a task.

Ansiversa motto: Make it simple - but not simpler.
