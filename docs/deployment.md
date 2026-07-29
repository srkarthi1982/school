# Deployment (develop → QA)

Continuous deployment of the `develop` branch to the Windows Server 2022 box,
driven by Azure DevOps Server.

- **Trigger:** every push to `develop`. A completed pull request into `develop`
  pushes a merge commit, so the same CI trigger also covers PR merges.
- **Pipeline:** [`azure-pipelines.yml`](../azure-pipelines.yml) →
  [`scripts/deploy.ps1`](../scripts/deploy.ps1).
- **Backend process:** runs as a Windows service (`JAI-School`) managed by
  [NSSM](https://nssm.cc), so it survives pipeline job-end and server reboots.
- **Frontend:** built to `frontend/dist` and served **by the backend**
  (FastAPI mounts `frontend/dist` at startup — same-origin, no separate web
  server).

## Why a service (NSSM)

The Azure DevOps agent tags every process a job spawns with
`VSTS_PROCESS_LOOKUP_ID` and **kills them when the job ends**. A backend
launched directly from the pipeline (e.g. a detached `start-server.bat`) is
therefore reaped moments after the deploy finishes. A Windows service is owned
by the Service Control Manager, so it is immune to that cleanup and also
auto-starts after a reboot (`Start=SERVICE_AUTO_START`).

## One-time prerequisites (on the build/deploy agent box)

- **Azure DevOps agent** registered in the `WinServer2022-Build` pool, running
  as a **local Administrator**. Installing and controlling a Windows service is
  privileged — a non-admin agent will fail at `nssm install` with access
  denied.
- **`nssm.exe` on `PATH`** (or pass `-Nssm <path>` to the script).
- **`uv`** and **Node.js/`npm`** on `PATH`.
- **PostgreSQL** running with the database referenced by the backend
  `DATABASE_URL` reachable from the box.
- **Env files** (force-copied into the workspace on every deploy):
  - `C:\qa-env\.env` → `backend\.env`. Must set a non-default `SECRET_KEY`
    (≥ 32 chars) or the app refuses to start; set real `DATABASE_URL`,
    `CORS_ORIGINS`, `COOKIE_SECURE=true`, LiveKit / LLM / ESNAAD values.
  - `C:\qa-env\.env.frontend` → `frontend\.env`. **Must** contain
    `VITE_BACKEND_URL=https://aitfs.jac.mil.ae:8000` (the live backend URL) so
    `npm run generate-types` can fetch `/openapi.json` and
    `/api/v1/access/permission-codes` during the build. The script sets
    `NODE_TLS_REJECT_UNAUTHORIZED=0` so the self-signed/internal cert is
    accepted during codegen.
- **TLS cert + key** at `c:/Cert/aitfs.jac.mil.ae.crt` and
  `c:/Cert/aitfs.jac.mil.ae.key`, readable by the service account.

## The `JAI-School` service

`deploy.ps1` installs (first run) and idempotently reconfigures the service
every deploy, so a changed workspace path or uvicorn arg self-heals on the next
run. Effective definition:

| NSSM setting     | Value                                                                 |
|------------------|-----------------------------------------------------------------------|
| `Application`    | `<workspace>\backend\.venv\Scripts\python.exe`                        |
| `AppDirectory`   | `<workspace>\backend`                                                 |
| `AppParameters`  | `-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile … --ssl-certfile … --timeout-keep-alive 65 --timeout-graceful-shutdown 15 --loop asyncio` |
| `AppStdout`      | `<workspace>\logs\uvicorn.log`                                        |
| `AppStderr`      | `<workspace>\logs\uvicorn.err.log`                                    |
| `Start`          | `SERVICE_AUTO_START` (starts on reboot)                              |
| `AppExit`        | `Default Restart` (restarts uvicorn if it crashes)                   |

The service runs as **LocalSystem** by default. To run under a specific
account (e.g. for network share / DB access):
`nssm set JAI-School ObjectName <DOMAIN\user> <password>`.

## Deploy flow (`deploy.ps1`)

1. **Prep** — resolve repo root, ensure `logs\`, verify `nssm` is available.
2. **Clone/branch** — optional (`-Clone`); in CI the agent has already checked
   out `develop`.
3. **Place env** — copy backend + frontend `.env` from `C:\qa-env`.
4. **Stop service** — `nssm stop JAI-School` (frees the `.venv` `python.exe`
   lock so `uv sync` can overwrite it on Windows), plus a legacy port cleanup
   for the first migration off the old detached model.
5. **Backend setup** — `uv venv` (if missing), `uv sync`,
   `alembic upgrade head` (migrate before the new code serves it).
6. **Start service** — (re)apply NSSM config, `nssm start JAI-School`, then
   wait for `https://…:8000/openapi.json` (backend must be live for codegen).
7. **Frontend** — `npm install` → `npm run generate-types` → `npm run build`
   (`HUSKY=0` so the `prepare` hook doesn't fail on the CI checkout;
   `NODE_TLS_REJECT_UNAUTHORIZED=0` for the internal cert). The new
   `frontend/dist` is served live from disk by the already-running backend.
8. **Health check** — wait for `https://…:8000/health`, print a summary.

## Manual / dry run

From a checkout on the box (on `develop`, with `backend\.env` present or
`-EnvFile` supplied):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 `
  -Host aitfs.jac.mil.ae -Port 8000 `
  -SslKeyfile c:/Cert/aitfs.jac.mil.ae.key `
  -SslCertfile c:/Cert/aitfs.jac.mil.ae.crt `
  -TimeoutKeepAlive 65 -TimeoutGracefulShutdown 15 -Loop asyncio
```

## Operations

```powershell
nssm status  JAI-School      # SERVICE_RUNNING when healthy
nssm restart JAI-School      # bounce the backend
nssm stop    JAI-School      # take it down
Get-Content .\logs\uvicorn.log -Tail 100 -Wait   # follow logs
```

## Troubleshooting

- **`nssm install` access denied** → the agent account is not a local
  Administrator. Fix the agent's run-as account (or grant it service-control
  rights).
- **`generate-types` fails / "Is the backend running?"** → the backend didn't
  come up on 8000, or `VITE_BACKEND_URL` in `frontend\.env` doesn't point at
  the live backend. Check `logs\uvicorn.err.log`.
- **`uv sync` fails with `WinError 32` (file in use)** → the service was still
  running when sync started; step 4 should have stopped it. Run
  `nssm stop JAI-School` and retry.
- **Port 8000 busy** → a leftover process (or a second service). Stop the
  service; if needed use `backend\stop-server.ps1 -Port 8000` to clear a
  stray process tree.

## Notes / caveats

- **`.env` handling.** The deploy script is **skip-if-exists**: a `.env`
  already in the workspace (backend or frontend) is used as-is and never
  overwritten — this is what lets you place env files by hand for a manual/dry
  run. In CI, the pipeline force-copies both env files fresh from `C:\qa-env`
  *before* the script runs, so CI always deploys the latest source values. For
  a manual run, either pre-place the `.env` files or pass
  `-EnvFile <path>` / `-FrontendEnvFile <path>`.
- **New top-level `dist` subfolders need a restart.** The backend mounts
  `dist/assets`, `dist/fonts`, `dist/icons` at startup; existing mounts serve
  freshly built files live, but a brand-new top-level folder only mounts after
  `nssm restart JAI-School`. (Pre-existing behavior; unchanged by the NSSM
  conversion.)
- **`pr:` trigger.** `azure-pipelines.yml` still has a `pr:` block on
  `develop`. On Azure DevOps Server this YAML key is typically inert for Azure
  Repos (PR validation is configured via branch policies), but if a policy ever
  points a validation build at this pipeline it would **deploy un-merged PR
  code**. If that's not intended, set `pr: none`.
```
