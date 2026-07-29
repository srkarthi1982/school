# MCP Server — Connecting External Clients to the LMS

The LMS exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so external
MCP-compatible clients (Claude Desktop, IDE assistants, other chat clients) can query the system
on a user's behalf.

> **End users**: for step-by-step client setup (Claude Desktop, Claude Code, VS Code, Cursor),
> see [`mcp-client-setup.md`](./mcp-client-setup.md). This page is the server/ops overview.

- **Endpoint**: `https://<lms-host>/api/v1/mcp` (streamable HTTP transport, stateless JSON mode)
- **Auth**: `Authorization: Bearer <personal access token>`
- **Scope**: every tool call runs **as the token's owner** with their normal roles/permissions —
  a student token sees only that student's courses, grades, schedule, etc.
- **Read-only**: only read tools are exposed over MCP. Mutating actions are not available to
  external clients by design.

## 1. Create a Personal Access Token

1. Log in to the LMS → **Settings → Account → Personal Access Tokens**.
2. Click **New token**, give it a name (e.g. "Claude Desktop") and an expiry (30/90/180 days).
3. **Copy the token immediately** — it is shown only once. Tokens look like `jai_pat_…`.
4. Revoke a token any time from the same page; revocation takes effect immediately.

## 2. Configure a client

### Claude Desktop (via mcp-remote)

Claude Desktop speaks stdio, so bridge to the HTTP endpoint with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jai-lms": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<lms-host>/api/v1/mcp",
        "--header",
        "Authorization: Bearer ${JAI_PAT}"
      ],
      "env": { "JAI_PAT": "jai_pat_..." }
    }
  }
}
```

### Clients with native streamable-HTTP support

Point the client at `https://<lms-host>/api/v1/mcp` and add the header
`Authorization: Bearer jai_pat_...`.

## 3. Available tools

The tool list is **per-user**: `tools/list` returns only the tools the token's owner is permitted
to use. The full read-only catalog: `list_my_courses`, `get_course_lessons`,
`list_course_materials`, `list_course_people`, `get_my_schedule`, `get_my_grades`,
`get_my_attendance`, `get_my_notifications`, `search_faq`, `get_academic_calendar`,
`search_knowledge`.

## 4. Operational notes

- Tool calls are rate-limited per user (`MCP_RATE_LIMIT_PER_MINUTE`, default 30/min).
- Every call is audited in `agent_runs` / `agent_run_steps` with `channel='mcp'` (who, which
  tool, which arguments, result summary, latency).
- Expired/revoked tokens and inactive users get `401` with `WWW-Authenticate: Bearer`.
- Server-side validation script: `backend/scripts/validate_mcp_client.py` (runs a real MCP client
  against a live server and asserts permission filtering and scoping).
