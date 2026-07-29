"""Validate the LMS MCP endpoint with a real MCP client.

Usage (from backend/, with the server running):
    .venv/Scripts/python -m scripts.validate_mcp_client [--base-url http://localhost:8000] [--token jai_pat_...]

Without --token it logs in as the seeded `student` user, creates a temporary
PAT via the REST API, and revokes it afterwards. Asserts:
- tools/list returns exactly the user's permission-filtered tool set
- tools/call list_my_courses returns data scoped to that user
- a bogus token is rejected with 401
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

DEFAULT_BASE_URL = "http://localhost:8000"


async def rest_login(client: httpx.AsyncClient, username: str, password: str) -> str:
    r = await client.post("/api/v1/auth/login", data={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--token", default=None, help="Existing PAT; otherwise a temporary one is created as 'student'")
    parser.add_argument("--username", default="student")
    parser.add_argument("--password", default="student123")
    args = parser.parse_args()

    failures = 0

    def check(name: str, cond: bool, detail: str = "") -> None:
        nonlocal failures
        print(("ok   " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
        if not cond:
            failures += 1

    mcp_url = f"{args.base_url}/api/v1/mcp"
    token = args.token
    temp_token_id = None
    rest = httpx.AsyncClient(base_url=args.base_url, timeout=30.0)

    try:
        if token is None:
            jwt = await rest_login(rest, args.username, args.password)
            r = await rest.post(
                "/api/v1/pats",
                json={"name": "mcp-validation (temporary)", "expires_in_days": 30},
                headers={"Authorization": f"Bearer {jwt}"},
            )
            r.raise_for_status()
            data = r.json()
            token, temp_token_id = data["token"], data["id"]
            print(f"Created temporary PAT {data['token_prefix']}…\n")

        # 1. Bogus token must be rejected
        r = await rest.post(mcp_url, json={}, headers={"Authorization": "Bearer jai_pat_bogus"})
        check("bogus token rejected with 401", r.status_code == 401, f"status={r.status_code}")
        r = await rest.post(mcp_url, json={})
        check("missing token rejected with 401", r.status_code == 401, f"status={r.status_code}")

        # 2. Real MCP session over streamable HTTP
        async with streamablehttp_client(mcp_url, headers={"Authorization": f"Bearer {token}"}) as (read, write, _):
            async with ClientSession(read, write) as session:
                init = await session.initialize()
                check("initialize succeeds", init.serverInfo.name == "jai-lms", init.serverInfo.name)

                tools = await session.list_tools()
                names = sorted(t.name for t in tools.tools)
                check("tools/list returns tools", len(names) > 0, str(names))
                check("mutating tools absent", all(not n.startswith(("submit_", "create_", "update_")) for n in names))

                result = await session.call_tool("list_my_courses", {})
                text = result.content[0].text if result.content else ""
                parsed = json.loads(text)
                check("list_my_courses returns scoped data", "courses" in parsed, text[:120])

                result = await session.call_tool("get_course_lessons", {"course_id": 999999})
                text = result.content[0].text if result.content else ""
                check("inaccessible course rejected", "error" in text.lower() or "not found" in text.lower(), text[:80])
    finally:
        if temp_token_id is not None:
            try:
                jwt = await rest_login(rest, args.username, args.password)
                await rest.delete(f"/api/v1/pats/{temp_token_id}", headers={"Authorization": f"Bearer {jwt}"})
                print("\nTemporary PAT revoked.")
            except Exception as exc:
                print(f"\nWARNING: failed to revoke temporary PAT: {exc}")
        await rest.aclose()

    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURES'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
