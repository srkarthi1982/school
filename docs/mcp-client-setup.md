# Connecting Your AI Assistant to the JAI LMS (MCP Client Setup Guide)

This guide is for **end users** (students, instructors, staff) who want to connect an
MCP-compatible AI assistant — Claude Desktop, Claude Code, VS Code, Cursor, or any other
[Model Context Protocol](https://modelcontextprotocol.io) client — to the JAI Information System.

Once connected, your assistant can answer questions using **your** live LMS data:

> *"What courses am I enrolled in?" · "What's my schedule next week?" · "Who teaches my course?"
> · "How am I doing on my grades?" · "When does the semester end?"*

Everything runs under your own account and permissions: the assistant sees exactly what you can
see in the LMS — nothing more. All access is **read-only**.

---

## What you need

| Requirement | Details |
|---|---|
| LMS account | Your normal JAI Information System login |
| Personal Access Token (PAT) | Created in the LMS — steps below |
| The MCP endpoint URL | `https://<lms-host>/api/v1/mcp` (ask IT for your `<lms-host>`) |
| Node.js 18+ | Only for clients that need the `mcp-remote` bridge (e.g. Claude Desktop) |

---

## Step 1 — Create a Personal Access Token

1. Log in to the LMS in your browser.
2. Go to **Settings → Account** and find the **Personal Access Tokens** section.
3. Click **New token**.
4. Enter a name that identifies where you'll use it (e.g. `Claude Desktop — work laptop`) and
   choose an expiry (30, 90, or 180 days).
5. Click **Create token**, then **copy the token immediately**. It looks like:

   ```
   jai_pat_Xk3nT9...
   ```

   ⚠️ **The token is shown only once.** If you lose it, revoke it and create a new one.

Treat the token like a password — anyone who has it can read your LMS data until it expires or
you revoke it (same page, trash icon).

---

## Step 2 — Configure your client

### Claude Desktop

Claude Desktop connects to remote servers through the `mcp-remote` bridge (requires Node.js).

1. Open the config file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the server (create the file if it doesn't exist):

   ```json
   {
     "mcpServers": {
       "jai-lms": {
         "command": "npx",
         "args": [
           "mcp-remote",
           "https://<lms-host>/api/v1/mcp",
           "--header",
           "Authorization:${AUTH_HEADER}"
         ],
         "env": {
           "AUTH_HEADER": "Bearer jai_pat_YOUR_TOKEN_HERE"
         }
       }
     }
   }
   ```

   > Note: the header is split via the `AUTH_HEADER` env variable on purpose — Claude Desktop
   > has a known issue with spaces inside `args` entries.

3. Fully restart Claude Desktop (quit from the tray/menu bar, not just close the window).
4. Look for the tools icon (🔨) in the chat input — `jai-lms` should be listed.

### Claude Code (CLI)

```bash
claude mcp add --transport http jai-lms https://<lms-host>/api/v1/mcp \
  --header "Authorization: Bearer jai_pat_YOUR_TOKEN_HERE"
```

Verify with `/mcp` inside a Claude Code session.

### VS Code (GitHub Copilot / MCP)

Create or edit `.vscode/mcp.json` in your workspace (or use **MCP: Add Server** from the command
palette):

```json
{
  "servers": {
    "jai-lms": {
      "type": "http",
      "url": "https://<lms-host>/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer jai_pat_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Cursor

Create or edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project):

```json
{
  "mcpServers": {
    "jai-lms": {
      "url": "https://<lms-host>/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer jai_pat_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Any other MCP client

If the client supports **streamable HTTP** (sometimes labeled "remote server" or just "HTTP")
natively:

- **URL**: `https://<lms-host>/api/v1/mcp`
- **Header**: `Authorization: Bearer jai_pat_YOUR_TOKEN_HERE`

If it only supports stdio servers, put `npx mcp-remote <url> --header ...` in front of it, as in
the Claude Desktop example.

---

## Step 3 — Verify it works

Ask your assistant something only the LMS can answer:

> *"Using the jai-lms tools, list my courses."*

You should see it call the `list_my_courses` tool and answer with your actual enrollments.

For a technical check without an AI client, IT can use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL: https://<lms-host>/api/v1/mcp
# Header: Authorization = Bearer jai_pat_...
```

---

## What your assistant can access

The tool list is filtered by **your role** — you may see a subset of these:

| Tool | What it returns |
|---|---|
| `list_my_courses` | Courses you're enrolled in or teach |
| `get_course_lessons` | Lessons of one of your courses |
| `list_course_materials` | Material files of one of your courses |
| `list_course_people` | Instructors and classmates in your course |
| `get_my_schedule` | Personal calendar + active courses for the coming days |
| `get_my_grades` | Your own grading progress |
| `get_my_attendance` | Your own attendance summary |
| `get_my_notifications` | Your recent notifications |
| `search_faq` | Official FAQ / policy entries |
| `get_academic_calendar` | Academic years and semester dates |
| `search_knowledge` | How-to guides for using the LMS |

Not available over MCP: anything that **changes** data (enrolling, submitting forms, grading).
These are intentionally excluded for external clients.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `401 Unauthorized` | Token missing, mistyped, expired, or revoked. Check the `Authorization: Bearer …` header, or create a fresh token in Settings → Account. |
| Server connects but a tool is missing | Your role doesn't have the matching permission (e.g. lessons need `course_info:read`). Ask an admin to check your role grants. |
| `Rate limit exceeded` | More than the allowed tool calls per minute (default 30). Wait a minute and retry. |
| TLS/certificate errors via `mcp-remote` | On networks with self-signed certificates, ask IT for the CA bundle (`export NODE_EXTRA_CA_CERTS=/path/to/ca.pem` before starting the client). Avoid disabling TLS verification. |
| Claude Desktop doesn't show the server | Fully quit and restart the app; check JSON syntax; confirm Node.js 18+ is installed (`node --version`). |
| Worked yesterday, 401 today | Tokens expire (30/90/180 days). Check Settings → Account and issue a new one. |

**Security reminders**

- Never share your token or commit it to a repository.
- Create a separate token per device/client so you can revoke one without breaking the others.
- Revoke tokens you no longer use — revocation is immediate.
- Every tool call made with your token is logged against your account.

---

*For the server-side/ops view of this feature (architecture, audit, configuration), see
[`docs/mcp.md`](./mcp.md).*
