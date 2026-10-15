"""Cursor adapter: Trace hooks; the System reaches Cursor through `AGENTS.md`.

Cursor loads a root `AGENTS.md` as an always-applied rule (checked in 3.24.9), so the
`AGENTS.md` Codex and Claude Code read is Cursor's too. The adapter used to write the
System body into `.cursor/rules/system.mdc` as well, and a workspace with both handed
Cursor the System twice on every turn; `write_agents_md` now removes that rule.
"""

from __future__ import annotations

import json
from pathlib import Path

from adapter.codex import write_agents_md
from adapter.hookscript import install_hook_script
from memory.host import interpreter

HOOK_EVENTS = (
    "beforeSubmitPrompt",
    "beforeReadFile",
    "afterFileEdit",
    "afterMCPExecution",
    "afterShellExecution",
    "stop",
)


def _hook_command() -> str:
    """Prefer python3 (macOS/Linux). Fall back to python (Windows, SETTLED #38)."""
    return f"{interpreter()} .cursor/hooks/write-trace.py"


def materialize_cursor(workspace: Path) -> None:
    """Write `AGENTS.md` and `.cursor/` Trace hooks from `System.md`. Fail if it is missing."""
    write_agents_md(workspace)
    hooks_config = {
        "version": 1,
        "hooks": {
            name: [{"command": _hook_command(), "timeout": 15}] for name in HOOK_EVENTS
        },
    }
    install_hook_script(workspace / ".cursor" / "hooks")
    (workspace / ".cursor" / "hooks.json").write_text(
        json.dumps(hooks_config, indent=2) + "\n",
        encoding="utf-8",
    )
