```
       █████   █████████   █████
      ▒▒███   ███▒▒▒▒▒███ ▒▒███ 
       ▒███  ▒███    ▒███  ▒███ 
       ▒███  ▒███████████  ▒███ 
       ▒███  ▒███▒▒▒▒▒███  ▒███ 
 ███   ▒███  ▒███    ▒███  ▒███ 
▒▒████████   █████   █████ █████
 ▒▒▒▒▒▒▒▒   ▒▒▒▒▒   ▒▒▒▒▒ ▒▒▒▒▒ 
```                                
# JAI School LMS
                                
Academic information system for Joint Aviation Institute — managing student enrollment, attendance, scheduling, grades, and user administration.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Zustand, Tailwind CSS |
| Backend | FastAPI (Python 3.12+), SQLAlchemy 2.0 |
| Database | PostgreSQL + Alembic migrations |
| Auth | JWT (OAuth2 password flow), bcrypt, LDAP support |
| API Client | Auto-generated TypeScript client via openapi-ts |
| Testing | Playwright (e2e), pytest |

### Features List
- Chat
- Schedule
- Quiz bank
- Profile
- E-forms
- Task creation
- Notification
- Surveys
- Material viewer
- Evaluation engine
- Dashboard page
- Attendance
- Library
- Course material
- Assessment
- Smart library
- Podcast
- Suggestions
- Virtual class
- Analysis
- Video hub
- Achievements
- Interactive learning material
- AI interface (future)
- Curriculum control
- System settings

## Getting Started

**Backend**
```bash
cd backend
uv sync
cp .env.example .env        # set DATABASE_URL and SECRET_KEY
start-server.bat
```

The backend logs to the console and to `backend/logs/app.log` (rotated daily, 14 days kept). Do not redirect output to a file (`> server.log 2>&1`) — the app manages its own log files. Set `LOG_TO_FILE=false` in `backend/.env` to disable the file log.

**Frontend**
```bash
cd frontend
npm install
npm run generate-types      # backend server has to run
npm run dev                 # dev server on http://localhost:5175
```

API docs available at `http://localhost:8000/docs` or `http://localhost:8000/redoc` when the backend is running.

## Debugging production errors (frontend)

`vite build` emits **hidden sourcemaps**: `dist/assets/*.js.map` files exist but the
served JS carries no `sourceMappingURL`, so users never load the source. A stack-trace
position is only valid for the exact build that produced it.

**Easy mode** — paste the error straight from the browser console; the tool downloads
the matching `.map` files from the production server automatically and rewrites every
frame to the original `.tsx` position:

```bash
cd frontend
node scripts/symbolicate.mjs error.txt        # stack saved to a file, or:
<paste> | node scripts/symbolicate.mjs        # pipe from clipboard/stdin

# Uncaught TypeError: x is undefined
#     at Wn (https://lms.example/assets/index-Dx3k2A.js:1:48213)
# becomes:
#     at Wn (src/modules/.../SomeComponent.tsx:87:12)
```

Use `--map-dir <dir>` to resolve maps from an archived-release folder instead of
fetching (needed if `*.map` is excluded from the deployment). For self-signed HTTPS:
`NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/symbolicate.mjs ...`.

**Manual mode** (one position, offline):

```bash
node scripts/symbolicate.mjs dist/assets/index-Dx3k2A.js.map 1:48213
# → src/modules/.../SomeComponent.tsx:87:12  (handleSubmit)
```
