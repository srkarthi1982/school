# Aircraft Viewer API

The backend serves the isolated static aircraft viewer at:

```text
GET /api/v1/aircraft-viewer/?name=aircraft_viewer
```

The operation appears under **Internal Aircraft Viewer** in `/docs`.
`AIRCRAFT_VIEWER_ENABLED` controls registration and defaults to `true` for this
internal project.

The required `name` parameter currently accepts only `aircraft_viewer`. It is
an allowlisted package identifier and is never used as an arbitrary filesystem
path. Viewer files live only under:

```text
backend/private_uploads/UH-60M - CCP_Windows/resources/app/
```

The configured entry file is `index.htm`.

The route is stateless and adds no database model, schema, migration, service,
repository, or external package dependency. A normal iframe cannot attach a
bearer token as a custom `Authorization` header; do not place tokens in its URL.

The index and nested static assets follow the project's standard `APIRouter`
convention and are registered with `app.include_router`. The asset catch-all
resolves files only inside the configured viewer directory and returns 404 for
missing or escaping paths. This avoids ordering conflicts with the JAI SPA
fallback route.

The frontend feature is located under
`frontend/src/modules/course-management/aircraft-viewer` and is discovered
through its feature manifest. Its route is:

```text
/course-management/aircraft-viewer
```

The iframe uses the same-origin relative API URL, allowing the Vite proxy to
forward it during development and the backend host to serve it in production.

## Database-free local verification

When PostgreSQL is unavailable, run:

```bat
backend\start-aircraft-viewer.bat
```

This starts `app.aircraft_viewer_app` on port 8000. It reuses the same router,
configured entry file, static asset mount, MIME handling, CSP policy, and query
validation as the full JAI application, but it does not import or start the
database, permission synchronization, schedulers, analytics, RAG, MCP, or other
JAI runtime services.

Verify:

```text
http://localhost:8000/health
http://localhost:8000/docs
http://localhost:8000/api/v1/aircraft-viewer/?name=aircraft_viewer
```

This entry point is for local viewer verification only. Production and complete
JAI development must continue to use the normal application entry point and its
PostgreSQL database.
