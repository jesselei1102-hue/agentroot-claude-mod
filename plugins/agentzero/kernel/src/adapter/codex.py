"""Codex adapter: materialize portable System.md into native Codex files."""

from __future__ import annotations

import json
from pathlib import Path

from adapter.hookscript import install_hook_script
from memory.host import interpreter, render

_AGENTS = "AGENTS.md"
_OVERRIDE = "AGENTS.override.md"
LEGACY_CURSOR_RULE = Path(".cursor") / "rules" / "system.mdc"
LEGACY_CURSOR_RULE_HEAD = "---\ndescription: AgentZero System"
"""How the rule an older Cursor adapter generated begins; one the operator wrote does not."""
GENERATED = "# AgentZero System (generated)"
_HEADER = f"""\
{GENERATED}

Do not edit by hand. Refresh with `agentroot materialize --harness codex`
(in a framework checkout: `PYTHONPATH=src python -m adapter materialize --harness codex`).

Codex and Cursor read this file; Claude Code reads it through `CLAUDE.md`.

"""

HOOK_SCRIPT = ".codex/hooks/write-trace.py"
_FIND_AND_RUN = (
    "import runpy,sys;from pathlib import Path;"
    "here=Path.cwd().resolve();"
    f"hook=next((p/'{HOOK_SCRIPT}' for p in (here,*here.parents)"
    f" if (p/'{HOOK_SCRIPT}').is_file()),None);"
    "runpy.run_path(str(hook),run_name='__main__') if hook else"
    f" (print('AgentRoot: no {HOOK_SCRIPT} in '+str(here)+' or above it',file=sys.stderr),"
    "print('{}'))"
)
"""Walks up from where the session started to the nearest workspace and runs its hook.

No `$`, backtick, backslash or double quote, so sh, PowerShell and cmd all pass it
through the double quotes unchanged.
"""


def _hook_command() -> str:
    """Codex names no project directory, and may start from a subdirectory.

    The command found its script through `$(git rev-parse --show-toplevel)`, so a
    workspace that was not a git repository ran `/.codex/hooks/write-trace.py`
    and no hook ever ran; inside another repository it reached that repository's
    `.codex/`. Was hard-coded to `python3`, the one adapter that did not resolve
    per host (SETTLED #38) — so it failed on a Windows host that has only `python`.
    """
    return f'{interpreter()} -c "{_FIND_AND_RUN}"'


HOOK_EVENTS = (
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "SubagentStop",
)


def agents_md(system: str) -> str:
    """What `AGENTS.md` holds for this System body; preflight compares against it."""
    return render(_HEADER + system.lstrip())


def write_agents_md(workspace: Path) -> None:
    """The one generated copy of `System.md`, which Codex, Cursor and Claude Code read.

    Codex reads `AGENTS.override.md` instead of `AGENTS.md` when both are there, so an
    override AgentZero generated before 2026-09-27 is removed; one the operator wrote is
    left for preflight to point out. Cursor loads `AGENTS.md` beside its own rules, so the
    `.cursor/rules/system.mdc` an older Cursor adapter generated would be a second copy.
    """
    system = (workspace / "System.md").read_text(encoding="utf-8")
    (workspace / _AGENTS).write_text(agents_md(system), encoding="utf-8")
    for generated, head in (
        (workspace / _OVERRIDE, GENERATED),
        (workspace / LEGACY_CURSOR_RULE, LEGACY_CURSOR_RULE_HEAD),
    ):
        if generated.is_file() and generated.read_text(encoding="utf-8").startswith(head):
            generated.unlink()


def materialize_codex(workspace: Path) -> None:
    """Write `AGENTS.md` and `.codex/` Trace hooks from `System.md`."""
    write_agents_md(workspace)
    install_hook_script(workspace / ".codex" / "hooks")
    hooks_config = {
        "description": "AgentZero Trace capture for Codex",
        "hooks": {
            name: [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": _hook_command(),
                            "timeout": 15,
                        }
                    ]
                }
            ]
            for name in HOOK_EVENTS
        },
    }
    (workspace / ".codex" / "hooks.json").write_text(
        json.dumps(hooks_config, indent=2) + "\n",
        encoding="utf-8",
    )
