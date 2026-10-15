"""When the hot set was last loaded, so a write can say none was (SETTLED #70, #74).

Rule 3 loads the hot set once at the start of a session, and again after the harness
compacts or clears the context. `hot-set` notes when it ran; a write made with no hot
set loaded in the last six hours says so. #70 also asked for a reload whenever a write's
subject shared nothing with the hints; per-message reloads duplicated Memory in the
agent's own context (turn-by-turn test, 2026-09-27), so that trigger is gone.

It also notes which Facts it loaded. The hook writes a Trace from file reads, and the
hot set arrives as command output, so without this every Trace said no Fact was loaded
and lint nominated every active Fact for retirement.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

from memory.host import command
from memory.text import slug

_STATE = Path("traces") / "hot-set.last"
"""Under `memory/traces/`, which a workspace ignores: run state, not Memory. Not `.yaml`,
so nothing that reads Traces from that folder mistakes it for one."""

_FRESH = timedelta(hours=6)
_LOAD = 'memory hot-set --scope project --hints "<keywords>"'


def note_hot_set(
    memory_dir: Path,
    hints: tuple[str, ...],
    *,
    fact_ids: tuple[str, ...] = (),
    now: datetime | None = None,
) -> None:
    """Record that the hot set was loaded now, for these hints. Never fails the command."""
    clock = now or datetime.now().astimezone()
    try:
        path = memory_dir / _STATE
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            yaml.safe_dump(
                {
                    "at": clock.isoformat(timespec="seconds"),
                    "hints": list(hints),
                    "fact_ids": list(fact_ids),
                },
                allow_unicode=True,
                sort_keys=False,
            ),
            encoding="utf-8",
        )
    except OSError:
        pass


def hot_set_reminder(workspace: Path, *, now: datetime | None = None) -> str | None:
    """A line to print after a write when no hot set was loaded this session."""
    memory_dir = workspace / "memory"
    if not memory_dir.is_dir():
        return None
    clock = now or datetime.now().astimezone()
    state = _read(memory_dir / _STATE)
    at = _when(state.get("at")) if state else None
    if state is None or at is None or clock - at > _FRESH:
        return f"no hot set loaded in this session yet: load it once, now: {command(_LOAD)}"
    return None


def hot_set_fact_ids(memory_dir: Path, *, at: datetime) -> tuple[str, ...]:
    """The Facts a run ending `at` had in context: those of this session's hot set.

    "This session" is the same six hours the reminder uses; no harness hands the command
    a session id. Never raises: the Trace hook fails open.
    """
    state = _read(memory_dir / _STATE)
    loaded_at = _when(state.get("at")) if state else None
    if state is None or loaded_at is None or not timedelta(0) <= at - loaded_at <= _FRESH:
        return ()
    ids = state.get("fact_ids")
    return tuple(str(item) for item in ids) if isinstance(ids, list) else ()


_REMINDED = Path("traces") / ".reminded"
"""One file per session asked, so one session's reminder does not silence another's."""

_LOCK = ".lock"
_STALE_LOCK = timedelta(minutes=1)
"""A lock older than this was left by a hook that died; a live one holds it for milliseconds."""


def _claim(lock: Path) -> Path | None:
    """Take the session's lock, or None when another hook process holds it.

    Cursor runs a project's Claude Code hooks beside its own, so two hook processes
    answer the same prompt at once; both read "not asked yet" and Cursor joined their
    two reminders into one message. Never raises: on a folder it cannot write, the
    reminder goes out unguarded rather than not at all.
    """
    for _ in range(2):
        try:
            lock.parent.mkdir(parents=True, exist_ok=True)
            os.close(os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            return lock
        except FileExistsError:
            try:
                age = datetime.now().timestamp() - lock.stat().st_mtime
            except OSError:
                continue  # released between the two calls; try once more
            if age < _STALE_LOCK.total_seconds():
                return None
            lock.unlink(missing_ok=True)
        except OSError:
            return lock
    return None


def prompt_reminder(
    workspace: Path, *, session: str | None = None, now: datetime | None = None
) -> str | None:
    """A line for the agent when the operator writes and the hot set has gone stale.

    The reminder after a write never came in a real session: the hot set was loaded one
    evening, the conversation resumed the next day with no write, and a standing
    preference 60 turns back was not applied (SETTLED #89). The Trace hook runs on
    every prompt, so it asks. At most once per stale period, so an agent that ignores
    it is not told again on every message. Counted per session: a Codex guardian
    subagent took the one reminder of a workspace, and the operator's own session,
    resumed 45 minutes later, was not asked (SETTLED #90).
    """
    clock = now or datetime.now().astimezone()
    if hot_set_reminder(workspace, now=clock) is None:
        return None
    folder = workspace / "memory" / _REMINDED
    path = folder / slug(session or "workspace")
    lock = _claim(path.with_name(path.name + _LOCK))
    if lock is None:
        return None  # another hook for this same prompt is answering it
    try:
        try:
            last = _when(path.read_text(encoding="utf-8").strip())
        except OSError:
            last = None
        if last is not None and clock - last <= _FRESH:
            return None
        try:
            path.write_text(clock.isoformat(timespec="seconds"), encoding="utf-8")
            for other in folder.iterdir():
                if other.name.endswith(_LOCK):
                    continue
                asked = _when(other.read_text(encoding="utf-8").strip())
                if asked is not None and clock - asked > _FRESH * 4:
                    other.unlink()
        except OSError:
            pass
    finally:
        lock.unlink(missing_ok=True)
    return (
        "AgentZero: no hot set was loaded in the last six hours, so this project's Memory "
        f"may be out of view. Before you answer, run: {command(_LOAD)}"
    )


def operator_message(workspace: Path, *, now: datetime | None = None) -> str | None:
    """What the operator typed in the turn now running, as the prompt hook staged it.

    The newest prompt line under `memory/traces/.staging/` within six hours, cleaned of
    the app's UI state. No harness tells a command its turn, so with two sessions
    prompting in the same seconds this can be the other one's (SETTLED #95).
    """
    staging = workspace / "memory" / "traces" / ".staging"
    if not staging.is_dir():
        return None
    clock = (now or datetime.now().astimezone()).timestamp()
    newest: tuple[float, str] | None = None
    for path in staging.glob("*.jsonl"):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                record = yaml.safe_load(line)
            except yaml.YAMLError:
                continue
            if not isinstance(record, dict):
                continue
            if record.get("hook_event_name") != "beforeSubmitPrompt":
                continue
            at = record.get("at")
            if not isinstance(at, int | float) or clock - at > _FRESH.total_seconds():
                continue
            if newest is None or at > newest[0]:
                newest = (float(at), str(record.get("prompt") or ""))
    if newest is None:
        return None
    from traces.normalize import task_as_asked

    return task_as_asked(newest[1]) or None


def _read(path: Path) -> dict[str, Any] | None:
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return None
    return loaded if isinstance(loaded, dict) else None


def _when(raw: object) -> datetime | None:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.astimezone()
    try:
        parsed = datetime.fromisoformat(str(raw))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.astimezone()
