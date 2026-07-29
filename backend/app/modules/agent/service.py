from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict
from typing import Any
from uuid import UUID

from anyio import to_thread
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.agent.context import UserContext, build_user_context
from app.modules.agent.llm import LLMProvider, LLMResponse, OpenAICompatibleProvider
from app.modules.agent.models import (
    Agent,
    AgentConversationSummary,
    AgentRun,
    AgentRunStep,
    AgentUserMemory,
)
from app.modules.agent.prompts import build_system_prompt
from app.modules.agent.tools import ToolSpec, execute_tool, openai_tool_schema, tools_for

logger = logging.getLogger(__name__)

_ERROR_REPLY = "I'm sorry, I encountered an error while processing your message. Please try again later."


class AgentService:
    """Runs the tool-calling loop for one incoming agent-conversation message.

    Invoked as a fire-and-forget asyncio task from the chat layer after the
    user's message is committed. All DB work runs in worker threads (the app
    uses sync SQLAlchemy); runs are serialized per conversation and capped
    globally.
    """

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self.llm = llm or OpenAICompatibleProvider()
        self._locks: dict[UUID, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._semaphore = asyncio.Semaphore(settings.AGENT_MAX_CONCURRENCY)

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    async def handle_message(
        self,
        conversation_id: UUID,
        agent_id: UUID,
        user_id: int,
        trigger_message_id: UUID | None,
    ) -> None:
        async with self._locks[conversation_id], self._semaphore:
            try:
                await asyncio.wait_for(
                    self._run(conversation_id, agent_id, user_id, trigger_message_id),
                    timeout=settings.AGENT_RUN_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger.error("Agent run timed out (conversation=%s user=%s)", conversation_id, user_id)
                await self._deliver_reply(conversation_id, agent_id, _ERROR_REPLY)
            except Exception:
                logger.exception("Agent run crashed (conversation=%s user=%s)", conversation_id, user_id)
                await self._deliver_reply(conversation_id, agent_id, _ERROR_REPLY)

    async def _run(
        self,
        conversation_id: UUID,
        agent_id: UUID,
        user_id: int,
        trigger_message_id: UUID | None,
    ) -> None:
        started = time.monotonic()
        await self._status(conversation_id, "Thinking…")

        db: Session = await to_thread.run_sync(SessionLocal)
        run: AgentRun | None = None
        input_tokens = 0
        output_tokens = 0
        try:
            agent, ctx, messages = await to_thread.run_sync(
                self._prepare, db, conversation_id, agent_id, user_id
            )
            run = await to_thread.run_sync(
                self._create_run, db, agent_id, conversation_id, user_id, trigger_message_id
            )

            specs = tools_for(ctx)
            specs_by_name = {spec.name: spec for spec in specs}
            tool_schemas = [openai_tool_schema(spec) for spec in specs]
            seq = 0
            reply: str | None = None

            for _ in range(settings.AGENT_MAX_ITERATIONS):
                llm_started = time.monotonic()
                response: LLMResponse = await self.llm.complete(messages, tools=tool_schemas)
                input_tokens += response.input_tokens or 0
                output_tokens += response.output_tokens or 0
                seq += 1
                await to_thread.run_sync(
                    self._record_step, db, run.id, seq, "llm_call", None, None,
                    (response.content or "")[:500] or f"{len(response.tool_calls)} tool call(s)",
                    int((time.monotonic() - llm_started) * 1000),
                )

                if not response.tool_calls:
                    reply = (response.content or "").strip()
                    break

                messages.append(self._assistant_tool_message(response))
                for call in response.tool_calls:
                    spec = specs_by_name.get(call.name)
                    if spec is None:
                        result = json.dumps({"error": f"Unknown tool: {call.name}"})
                    else:
                        await self._status(conversation_id, spec.status_label or f"Using {spec.name}…")
                        tool_started = time.monotonic()
                        result = await to_thread.run_sync(execute_tool, spec, ctx, call.arguments)
                        seq += 1
                        await to_thread.run_sync(
                            self._record_step, db, run.id, seq, "tool_call", call.name,
                            call.arguments, result[:500],
                            int((time.monotonic() - tool_started) * 1000),
                        )
                    messages.append({"role": "tool", "tool_call_id": call.id, "content": result})
                await self._status(conversation_id, "Thinking…")

            if not reply:
                reply = "I'm sorry, I couldn't complete that request. Could you rephrase it?"

            await self._deliver_reply(conversation_id, agent_id, reply, agent_display_name=agent.display_name)

            try:
                summary_in, summary_out, seq = await self._maybe_summarize(
                    db, conversation_id, user_id, run.id, seq
                )
                input_tokens += summary_in
                output_tokens += summary_out
            except Exception:
                logger.exception("Conversation summarization failed (conversation=%s)", conversation_id)

            await to_thread.run_sync(
                self._finish_run, db, run.id, "succeeded", None,
                input_tokens, output_tokens, int((time.monotonic() - started) * 1000),
            )
        except Exception as exc:
            if run is not None:
                try:
                    await to_thread.run_sync(
                        self._finish_run, db, run.id, "failed", f"{type(exc).__name__}: {exc}",
                        input_tokens, output_tokens, int((time.monotonic() - started) * 1000),
                    )
                except Exception:
                    logger.exception("Failed to record failed agent run")
            raise
        finally:
            await to_thread.run_sync(db.close)

    # ------------------------------------------------------------------
    # Sync helpers (run in worker threads)
    # ------------------------------------------------------------------
    def _prepare(
        self, db: Session, conversation_id: UUID, agent_id: UUID, user_id: int
    ) -> tuple[Agent, UserContext, list[dict[str, Any]]]:
        from app.modules.users.models import User

        agent = db.get(Agent, agent_id)
        if agent is None or not agent.is_active:
            raise RuntimeError(f"Agent {agent_id} not found or inactive")

        user = db.execute(
            select(User)
            .options(selectinload(User.roles), selectinload(User.profile))
            .where(User.id == user_id)
        ).scalar_one()
        ctx = build_user_context(db, user)

        # A document-scoped conversation pins the agent (and search_materials)
        # to one document; the scope comes from the conversation row, never
        # from the model.
        from app.modules.chat.common.models import ChatConversation

        conversation = db.get(ChatConversation, conversation_id)
        if conversation is not None and conversation.kind == "agent_doc":
            ctx.doc_source_type = conversation.context_type
            ctx.doc_id = conversation.context_id
            ctx.doc_title = conversation.context_title

        memories = db.execute(
            select(AgentUserMemory)
            .where(AgentUserMemory.user_id == user_id)
            .order_by(AgentUserMemory.updated_at)
        ).scalars().all()
        summary = self._load_summary(db, conversation_id, user_id)

        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": build_system_prompt(
                    agent.display_name, ctx, memories, summary, document_title=ctx.doc_title
                ),
            }
        ]
        messages.extend(self._load_history(db, conversation_id, user_id))
        return agent, ctx, messages

    def _load_summary(self, db: Session, conversation_id: UUID, user_id: int) -> str | None:
        """The conversation's rolling summary, unless clear-chat superseded it."""
        from app.modules.chat.common.models import ChatConversationParticipant

        row = db.get(AgentConversationSummary, conversation_id)
        if row is None or row.user_id != user_id:
            return None
        participant = db.get(ChatConversationParticipant, (conversation_id, user_id))
        if participant is not None and participant.cleared_at and row.summarized_until <= participant.cleared_at:
            return None
        return row.summary

    def _load_history(self, db: Session, conversation_id: UUID, user_id: int) -> list[dict[str, str]]:
        """Last N visible chat messages as LLM history (oldest first).

        The chat transcript is the agent's only memory: "clear chat" resets it,
        and deleted messages drop out together with the reply they provoked.
        """
        from app.modules.chat.common.models import ChatConversationParticipant, ChatMessage

        participant = db.get(ChatConversationParticipant, (conversation_id, user_id))
        rows = db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.conversation_id == conversation_id,
                *( [ChatMessage.created_at > participant.cleared_at] if participant is not None and participant.cleared_at else [] ),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(settings.AGENT_HISTORY_LIMIT)
        ).scalars().all()

        history: list[dict[str, str]] = []
        skip_next_assistant = False
        for message in reversed(rows):
            role = "assistant" if message.sender_agent_id is not None else "user"
            if message.deleted_at is not None:
                if role == "user":
                    skip_next_assistant = True
                continue
            if skip_next_assistant and role == "assistant":
                skip_next_assistant = False
                continue
            history.append({"role": role, "content": message.content})
        return history

    # ------------------------------------------------------------------
    # Rolling conversation summary
    # ------------------------------------------------------------------
    async def _maybe_summarize(
        self, db: Session, conversation_id: UUID, user_id: int, run_id: UUID, seq: int
    ) -> tuple[int, int, int]:
        """Condense messages that scrolled out of the history window into the
        conversation's rolling summary. Runs after the reply is delivered so
        it never delays the user; failures are logged and skipped."""
        payload = await to_thread.run_sync(self._collect_summary_input, db, conversation_id, user_id)
        if payload is None:
            return 0, 0, seq
        prior, transcript, watermark = payload

        instructions = (
            "Condense the following chat between a user and an assistant into "
            "a running summary of at most 200 words. Keep facts the user "
            "stated, what they asked, and what the assistant answered or "
            "promised. Write plain prose with no preamble."
        )
        if prior:
            instructions += (
                "\n\nCurrent summary of the conversation so far:\n"
                f"{prior}\n\nUpdate it to also cover the new messages below."
            )

        started = time.monotonic()
        response = await self.llm.complete([
            {"role": "system", "content": instructions},
            {"role": "user", "content": transcript},
        ])
        summary = (response.content or "").strip()[: settings.AGENT_SUMMARY_MAX_CHARS]
        if summary:
            await to_thread.run_sync(
                self._store_summary, db, conversation_id, user_id, summary, watermark
            )
        seq += 1
        await to_thread.run_sync(
            self._record_step, db, run_id, seq, "llm_call", None, None,
            f"[summary] {summary[:400]}", int((time.monotonic() - started) * 1000),
        )
        return response.input_tokens or 0, response.output_tokens or 0, seq

    def _collect_summary_input(
        self, db: Session, conversation_id: UUID, user_id: int
    ) -> tuple[str | None, str, Any] | None:
        """(prior summary, transcript of not-yet-summarized overflow, watermark),
        or None when nothing has scrolled out of the window yet."""
        from app.modules.chat.common.models import ChatConversationParticipant, ChatMessage

        participant = db.get(ChatConversationParticipant, (conversation_id, user_id))
        cleared_at = participant.cleared_at if participant is not None else None

        # Boundary of the recent window _load_history feeds to the model.
        recent = db.execute(
            select(ChatMessage.created_at)
            .where(
                ChatMessage.conversation_id == conversation_id,
                *([ChatMessage.created_at > cleared_at] if cleared_at else []),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(settings.AGENT_HISTORY_LIMIT)
        ).scalars().all()
        if len(recent) < settings.AGENT_HISTORY_LIMIT:
            return None
        window_start = recent[-1]

        row = db.get(AgentConversationSummary, conversation_id)
        prior: str | None = None
        since = cleared_at
        if row is not None and row.user_id == user_id and (cleared_at is None or row.summarized_until > cleared_at):
            prior = row.summary
            since = row.summarized_until if since is None else max(since, row.summarized_until)

        stmt = (
            select(ChatMessage)
            .where(
                ChatMessage.conversation_id == conversation_id,
                ChatMessage.created_at < window_start,
                ChatMessage.deleted_at.is_(None),
            )
            .order_by(ChatMessage.created_at)
        )
        if since is not None:
            stmt = stmt.where(ChatMessage.created_at > since)
        overflow = db.execute(stmt).scalars().all()
        if len(overflow) < settings.AGENT_SUMMARY_MIN_OVERFLOW:
            return None

        transcript = "\n".join(
            f"{'Assistant' if m.sender_agent_id is not None else 'User'}: {m.content[:2000]}"
            for m in overflow
        )
        return prior, transcript, overflow[-1].created_at

    def _store_summary(
        self, db: Session, conversation_id: UUID, user_id: int, summary: str, watermark: Any
    ) -> None:
        row = db.get(AgentConversationSummary, conversation_id)
        if row is None:
            row = AgentConversationSummary(
                conversation_id=conversation_id, user_id=user_id,
                summary=summary, summarized_until=watermark,
            )
            db.add(row)
        else:
            row.user_id = user_id
            row.summary = summary
            row.summarized_until = watermark
        db.commit()

    def _create_run(
        self, db: Session, agent_id: UUID, conversation_id: UUID, user_id: int, trigger_message_id: UUID | None
    ) -> AgentRun:
        run = AgentRun(
            agent_id=agent_id,
            conversation_id=conversation_id,
            user_id=user_id,
            trigger_message_id=trigger_message_id,
            model=settings.LLM_MODEL,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    def _record_step(
        self, db: Session, run_id: UUID, seq: int, step_type: str,
        tool_name: str | None, arguments: dict | None, result_summary: str, duration_ms: int,
    ) -> None:
        db.add(AgentRunStep(
            run_id=run_id, seq=seq, step_type=step_type, tool_name=tool_name,
            arguments=arguments, result_summary=result_summary, duration_ms=duration_ms,
        ))
        db.commit()

    def _finish_run(
        self, db: Session, run_id: UUID, status: str, error: str | None,
        input_tokens: int, output_tokens: int, latency_ms: int,
    ) -> None:
        run = db.get(AgentRun, run_id)
        if run is None:
            return
        run.status = status
        run.error = error
        run.input_tokens = input_tokens
        run.output_tokens = output_tokens
        run.latency_ms = latency_ms
        db.commit()

    @staticmethod
    def _assistant_tool_message(response: LLMResponse) -> dict[str, Any]:
        return {
            "role": "assistant",
            "content": response.content,
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                }
                for call in response.tool_calls
            ],
        }

    # ------------------------------------------------------------------
    # Delivery
    # ------------------------------------------------------------------
    async def _status(self, conversation_id: UUID, text: str | None) -> None:
        """Ephemeral progress event for anyone with the thread open."""
        from app.modules.chat.common.services import manager

        try:
            await manager.broadcast_to_room(
                conversation_id,
                {"type": "agent.status", "conversation_id": str(conversation_id), "text": text},
            )
        except Exception:
            logger.debug("Failed to send agent.status", exc_info=True)

    async def _deliver_reply(
        self, conversation_id: UUID, agent_id: UUID, content: str, agent_display_name: str = "AskMAI"
    ) -> None:
        from app.modules.chat.common.models import ChatConversation
        from app.modules.chat.common.services import create_agent_message, manager, serialize_message_for_user
        from app.modules.notification.services import notify_users_and_push

        def _persist():
            db = SessionLocal()
            try:
                message, participant_ids = create_agent_message(db, conversation_id, agent_id, content)
                conversation = db.get(ChatConversation, conversation_id)
                kind = conversation.kind if conversation is not None else "agent"
                return message, participant_ids, kind
            finally:
                db.close()

        message, participant_ids, conversation_kind = await to_thread.run_sync(_persist)
        await self._status(conversation_id, None)
        for participant_id in participant_ids:
            personalized = serialize_message_for_user(message, participant_id)
            await manager.send_to_user(
                participant_id,
                {
                    "type": "message.created",
                    "conversation_id": str(conversation_id),
                    "message": personalized.model_dump(mode="json"),
                },
            )

        # Document chats live in the reader panel: the user is looking at the
        # reply, and the push deep-link (main chat page) wouldn't even list the
        # conversation — so no push/bell notification for them.
        if conversation_kind == "agent_doc":
            return

        recipients = [
            pid for pid in participant_ids if not manager.is_user_in_room(conversation_id, pid)
        ]
        if recipients:
            try:
                await notify_users_and_push(
                    recipients,
                    type="chat.new_message",
                    source_module="chat",
                    source_id=str(message.id),
                    link="/communication-reporting/chat",
                    title=f"New message from {agent_display_name}",
                    body=content[:140],
                    payload={
                        "conversation_id": str(conversation_id),
                        "message_id": str(message.id),
                        "sender_agent_id": str(agent_id),
                        "preview": content[:140],
                    },
                )
            except Exception:
                logger.exception("Failed to push notification for agent reply")


agent_service = AgentService()
