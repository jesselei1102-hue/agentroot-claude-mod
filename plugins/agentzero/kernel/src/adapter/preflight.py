"""Prove a workspace can actually run, instead of letting it look installed.

A workspace that cannot reach the runtime packages writes no Trace, and before
ticket 03 it said nothing about that. These checks are the automated form of
the manual A/B that found it: resolve the interpreter the hooks really use, and
push a real event sequence through the real hook.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import subprocess
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml

from adapter.claude import REGISTRATIONS as CLAUDE_REGISTRATIONS
from adapter.codex import (
    GENERATED,
    LEGACY_CURSOR_RULE,
    LEGACY_CURSOR_RULE_HEAD,
    agents_md,
)
from adapter.codex import HOOK_EVENTS as CODEX_EVENTS
from adapter.cursor import HOOK_EVENTS as CURSOR_EVENTS
from adapter.vendor import (
    VENDORED_PACKAGES,
    framework_version,
    plan_conventions,
    read_stamp,
    tree_hash,
)
from memory.host import command

Status = Literal["pass", "fail", "warn", "skip"]

_PROBE_TOOL = "agentzero-preflight"


@dataclass(frozen=True)
class Check:
    name: str
    status: Status
    detail: str
    fix: str | None = None


@dataclass(frozen=True)
class PreflightReport:
    workspace: Path
    checks: tuple[Check, ...]

    @property
    def failed(self) -> bool:
        return any(check.status == "fail" for check in self.checks)

    @property
    def warned(self) -> bool:
        return any(check.status == "warn" for check in self.checks)

    def render(self) -> str:
        glyph = {"pass": "ok  ", "fail": "FAIL", "warn": "warn", "skip": "skip"}
        lines = [f"preflight {self.workspace}"]
        for check in self.checks:
            lines.append(f"  [{glyph[check.status]}] {check.name}: {check.detail}")
            if check.fix:
                lines.append(f"           fix: {check.fix}")
        return "\n".join(lines) + "\n"


def hook_interpreter(workspace: Path) -> str | None:
    """The interpreter the wired hooks actually use, read from the workspace.

    Recomputing it here would test this machine rather than the workspace, and a
    workspace may have been materialized somewhere else.
    """
    command = hook_command(workspace)
    return shlex.split(command)[0] if command else None


_HOOK_CONFIGS: tuple[tuple[str, Path], ...] = (
    ("cursor", Path(".cursor") / "hooks.json"),
    ("codex", Path(".codex") / "hooks.json"),
    ("claude", Path(".claude") / "settings.json"),
)


def hook_command(workspace: Path) -> str | None:
    """The first wired Trace hook command, whatever harness wired it."""
    wired = wired_hooks(workspace)
    return wired[0][1] if wired else None


def wired_hooks(workspace: Path) -> list[tuple[str, str]]:
    """Each harness wired in this workspace, with the first hook command it runs."""
    found: list[tuple[str, str]] = []
    for harness, config in _HOOK_CONFIGS:
        command = _first_command(workspace / config)
        if command:
            found.append((harness, command))
    return found


def _first_command(config: Path) -> str | None:
    if not config.is_file():
        return None
    loaded = json.loads(config.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        return None
    for entries in (loaded.get("hooks") or {}).values():
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            # Cursor: a flat list of commands.
            command = str(entry.get("command") or "").strip()
            if command:
                return command
            # Claude Code and Codex: each event holds groups with their own hooks.
            for nested in entry.get("hooks") or []:
                if isinstance(nested, dict):
                    nested_command = str(nested.get("command") or "").strip()
                    if nested_command:
                        return nested_command
    return None


def run_preflight(
    workspace: Path,
    *,
    framework_root: Path | None = None,
    strict: bool = False,
) -> PreflightReport:
    """Five checks; see `.scratch/vendor-preflight/issues/02-preflight-checks.md`."""
    workspace = workspace.resolve()
    checks: list[Check] = [_check_packages(workspace)]
    interpreter = hook_interpreter(workspace)
    checks.append(_check_yaml_importable(workspace, interpreter))
    checks.append(_check_hook_round_trip(workspace))
    checks.append(_check_hook_events(workspace))
    checks.append(_check_version_skew(workspace, framework_root, strict=strict))
    checks.append(_check_conventions(workspace, framework_root))
    checks.append(_check_instructions(workspace))
    checks.append(_check_launcher(workspace))
    checks.append(_check_memory_shape(workspace))
    return PreflightReport(workspace=workspace, checks=tuple(_flag_outside_runtime(checks)))


def _flag_outside_runtime(checks: list[Check]) -> list[Check]:
    """A round trip that works while the packages are missing is a warning, not a pass.

    It means the runtime was satisfied from outside the workspace — an installed
    copy or PYTHONPATH. The workspace runs here and nowhere else, and that exact
    masking is what hid the missing-runtime bug through v0.1.
    """
    by_name = {check.name: check for check in checks}
    packages = by_name.get("packages")
    round_trip = by_name.get("hook round trip")
    if packages is None or round_trip is None:
        return checks
    if packages.status != "fail" or round_trip.status != "pass":
        return checks
    replacement = Check(
        name="hook round trip",
        status="warn",
        detail=(
            "a Trace was written, but the workspace has no runtime of its own — "
            "it is being satisfied by an installed copy or PYTHONPATH on this machine, "
            "and will stop working anywhere else"
        ),
        fix=f"re-run `{command('adapter materialize')}`",
    )
    return [replacement if check.name == "hook round trip" else check for check in checks]


# Every generated instruction file, the harness that owns it, and how it is built.
INSTRUCTION_FILES: tuple[tuple[str, str, Callable[[str], str]], ...] = (
    ("AGENTS.md", "codex", agents_md),
)


def _check_instructions(workspace: Path) -> Check:
    """A harness reads the rules materialize last wrote for it, not System.md.

    A Devin-era `materialize` refreshed AGENTS.md and left AGENTS.override.md as it
    was; Codex prefers the override, so it ran on rules two releases old and nothing
    said so. Found in a real workspace. AGENTS.md is Codex's now; any override shadows it.
    """
    system_path = workspace / "System.md"
    if not system_path.is_file():
        return Check("instructions", "skip", "no System.md in this workspace")
    system = system_path.read_text(encoding="utf-8")
    override = workspace / "AGENTS.override.md"
    if override.is_file():
        # Codex reads the override instead of AGENTS.md (2026-09-27: AGENTS.md is Codex's).
        generated = override.read_text(encoding="utf-8").startswith(GENERATED)
        return Check(
            name="instructions",
            status="warn",
            detail="AGENTS.override.md is there, so Codex reads it and never AGENTS.md"
            + (" (an older AgentZero wrote it)" if generated else ""),
            fix=f"{command('adapter materialize')} --harness codex"
            if generated
            else "fold what it says into System.md, or delete it, so Codex runs AgentZero",
        )
    legacy = workspace / LEGACY_CURSOR_RULE
    if legacy.is_file() and legacy.read_text(encoding="utf-8").startswith(LEGACY_CURSOR_RULE_HEAD):
        # Cursor loads AGENTS.md too, so this rule is the System a second time.
        return Check(
            name="instructions",
            status="warn",
            detail=f"{LEGACY_CURSOR_RULE.as_posix()} is left from an older AgentZero; "
            "Cursor also reads AGENTS.md, so it loads the System twice",
            fix=f"{command('adapter materialize')} {shlex.quote(str(workspace))} --harness cursor",
        )
    present = [item for item in INSTRUCTION_FILES if (workspace / item[0]).is_file()]
    if not present:
        return Check("instructions", "skip", "no generated instruction files")
    stale = [
        (name, harness)
        for name, harness, build in present
        if _comparable((workspace / name).read_text(encoding="utf-8")) != _comparable(build(system))
    ]
    if not stale:
        return Check("instructions", "pass", f"{len(present)} file(s) match System.md")
    harnesses = sorted({harness for _, harness in stale})
    return Check(
        name="instructions",
        status="warn",
        detail="written from an older System.md: "
        + ", ".join(f"{name} ({harness})" for name, harness in stale),
        fix=f"{command('adapter materialize')} {shlex.quote(str(workspace))}"
        + f" --harness {harnesses[0]}"
        + " (it refreshes every harness's rules)",
    )


def _comparable(text: str) -> str:
    """Ignore which interpreter spelled the commands; a workspace moves between hosts."""
    return re.sub(r"\bpython3? -m\b", "python -m", text)


def _check_launcher(workspace: Path) -> Check:
    """`./a0` runs here: every command the rules and hints name goes through it (SETTLED #71)."""
    launcher = workspace / "a0"
    if not launcher.is_file():
        return Check(
            name="launcher",
            status="fail",
            detail="no ./a0 in this workspace, so every command the rules name fails",
            fix=f"`{command('adapter materialize')}`",
        )
    if os.name == "nt":
        if (workspace / "a0.cmd").is_file():
            return Check("launcher", "pass", "a0.cmd present")
        return Check(
            "launcher",
            "fail",
            "no a0.cmd for Windows",
            fix=f"`{command('adapter materialize')}`",
        )
    if not os.access(launcher, os.X_OK):
        return Check(
            name="launcher",
            status="fail",
            detail="./a0 is not executable (a copy or an archive dropped the mode)",
            fix="chmod +x a0",
        )
    try:
        probe = subprocess.run(
            [str(launcher), "skills", "list"], capture_output=True, text=True, timeout=60
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return Check("launcher", "fail", f"./a0 cannot be run: {exc}", fix="chmod +x a0")
    if probe.returncode != 0:
        reason = (probe.stderr.strip().splitlines() or ["no output"])[-1]
        return Check("launcher", "fail", f"./a0 skills list failed: {reason}", fix=None)
    which = subprocess.run([str(launcher), "--which"], capture_output=True, text=True)
    python = next(
        (line.split(":", 1)[1].strip() for line in which.stdout.splitlines()
         if line.startswith("python:")),
        "a Python",
    )
    return Check("launcher", "pass", f"./a0 runs the workspace's src/ with {python}")


def _check_packages(workspace: Path) -> Check:
    missing = [
        name
        for name in VENDORED_PACKAGES
        if not (workspace / "src" / name / "__init__.py").is_file()
    ]
    if missing:
        return Check(
            name="packages",
            status="fail",
            detail=f"runtime packages missing from src/: {', '.join(missing)}",
            fix=f"re-run `{command('adapter materialize')}`",
        )
    return Check("packages", "pass", f"{len(VENDORED_PACKAGES)} runtime packages present")


def _check_yaml_importable(workspace: Path, interpreter: str | None) -> Check:
    if interpreter is None:
        return Check("hook interpreter", "skip", "no Trace hook wired in this workspace")
    resolved = shutil.which(interpreter) or interpreter
    try:
        probe = subprocess.run(
            [resolved, "-c", "import yaml"],
            capture_output=True,
            text=True,
            cwd=workspace,
        )
    except OSError as exc:
        # A workspace materialized on another host can name an interpreter that
        # does not exist here (SETTLED #38 picks python3 or python per machine).
        return Check(
            name="hook interpreter",
            status="fail",
            detail=f"{resolved} cannot be run: {exc.strerror or exc}",
            fix=f"re-run `{command('adapter materialize')}` on this machine",
        )
    if probe.returncode != 0:
        return Check(
            name="hook interpreter",
            status="fail",
            detail=f"{resolved} cannot import yaml — Traces will not be written",
            fix=f'{resolved} -m pip install "pyyaml>=6,<7"',
        )
    return Check("hook interpreter", "pass", f"{resolved} can import yaml")


def _probe_events(
    workspace: Path, harness: str, run_id: str
) -> tuple[dict[str, object], ...]:
    """A tool call then a stop, shaped like the harness that wired this hook.

    A stop with zero tool calls is a designed no-op (SETTLED #38), so a stop-only
    probe would assert nothing. Sending the harness's own shape also exercises
    the normalizer, not just the plumbing.
    """
    if harness in {"claude", "codex"}:
        # Codex and Claude Code share the event shape; each has its own run id field.
        id_field = "turn_id" if harness == "codex" else "prompt_id"
        return (
            {
                "hook_event_name": "PostToolUse",
                id_field: run_id,
                "session_id": f"session-{run_id}",
                "cwd": str(workspace),
                "tool_name": f"mcp__{_PROBE_TOOL}__ping",
                "tool_input": {},
                "tool_response": "ok",
                "success": True,
            },
            {
                "hook_event_name": "Stop",
                id_field: run_id,
                "session_id": f"session-{run_id}",
                "cwd": str(workspace),
                "stop_hook_active": False,
            },
        )
    return (
        {
            "hook_event_name": "afterMCPExecution",
            "generation_id": run_id,
            "workspace_roots": [str(workspace)],
            "tool_name": _PROBE_TOOL,
            "status": "ok",
        },
        {
            "hook_event_name": "stop",
            "generation_id": run_id,
            "workspace_roots": [str(workspace)],
        },
    )


_GIT_ROOT = "$(git rev-parse --show-toplevel)/"
"""How an older Codex adapter named the workspace root; `materialize` replaces it."""
_PROJECT_DIR = "$CLAUDE_PROJECT_DIR/"


def _hook_run(workspace: Path, command: str) -> tuple[list[str], Path] | str:
    """The argv the harness's shell makes of this command, and where to start it; or why not.

    Stripping the root prefix tested the workspace rather than the command: a Codex
    hook that went through git passed here and never ran in a workspace with no repo.
    """
    words = shlex.split(command)
    resolved = shutil.which(words[0]) or words[0]
    if words[1:2] == ["-c"] and len(words) > 2:
        # The command finds the workspace itself, so start it below the root, as Codex may.
        start = workspace / "memory"
        return [resolved, "-c", words[2]], start if start.is_dir() else workspace
    for token in words[1:]:
        if token.startswith(_GIT_ROOT):
            root = _git_top_level(workspace)
            if root is None:
                return (
                    "the command finds its script through git, "
                    "and no git repository holds this workspace"
                )
            candidate = root / token.removeprefix(_GIT_ROOT)
        else:
            candidate = workspace / token.removeprefix(_PROJECT_DIR)
        if candidate.is_file():
            return [resolved, str(candidate)], workspace
    return "the command names no hook script that exists"


def _git_top_level(workspace: Path) -> Path | None:
    try:
        found = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            cwd=workspace,
        )
    except OSError:
        return None
    return Path(found.stdout.strip()) if found.returncode == 0 else None


def _check_hook_round_trip(workspace: Path) -> Check:
    """Every wired harness, not only the first: a broken second one passed unseen."""
    wired = wired_hooks(workspace)
    if not wired:
        return Check("hook round trip", "skip", "no Trace hook wired in this workspace")
    failures = [
        f"{harness}: {reason}"
        for harness, wired_command in wired
        if (reason := _round_trip(workspace, harness, wired_command))
    ]
    if failures:
        return Check(
            name="hook round trip",
            status="fail",
            detail="; ".join(failures),
            fix=f"re-run `{command('adapter materialize')}` on this machine",
        )
    harnesses = ", ".join(harness for harness, _ in wired)
    return Check("hook round trip", "pass", f"probe event sequence produced a Trace ({harnesses})")


def _round_trip(workspace: Path, harness: str, wired_command: str) -> str | None:
    """Why this harness's hook wrote no Trace for a probe run, or None when it did."""
    run = _hook_run(workspace, wired_command)
    if isinstance(run, str):
        return run
    argv, start = run
    run_id = f"preflight-{uuid.uuid4().hex[:8]}"
    traces = workspace / "memory" / "traces"
    breadcrumb = traces / ".hook-error.log"
    before = breadcrumb.stat().st_size if breadcrumb.is_file() else 0
    try:
        for event in _probe_events(workspace, harness, run_id):
            subprocess.run(
                argv,
                input=json.dumps(event),
                capture_output=True,
                text=True,
                cwd=start,
            )
    except OSError as exc:
        _clean_probe(traces, run_id)
        return f"could not run the hook with {argv[0]}: {exc.strerror or exc}"

    produced = (traces / f"{run_id}.yaml").is_file()
    reason = _consume_breadcrumb(breadcrumb, before)
    _clean_probe(traces, run_id)
    if produced:
        return None
    detail = "hook produced no Trace for a probe run with a tool call"
    return f"{detail} — {reason}" if reason else detail


def _check_hook_events(workspace: Path) -> Check:
    """Every event this AgentZero registers is wired, not only the ones it once did.

    A new event reaches a workspace only through `materialize`; until then the round
    trip still passes and the new capture is silently missing (SETTLED #80, #83).
    """
    missing: dict[str, list[str]] = {}
    wired = 0
    for harness, config, expected in (
        ("cursor", ".cursor/hooks.json", [(name, None) for name in CURSOR_EVENTS]),
        ("codex", ".codex/hooks.json", [(name, None) for name in CODEX_EVENTS]),
        ("claude", ".claude/settings.json", list(CLAUDE_REGISTRATIONS)),
    ):
        path = workspace / config
        if not path.is_file():
            continue
        present = _wired_events(path, matchers=harness == "claude")
        if present is None:
            continue
        wired += 1
        absent = [
            event if matcher is None else f"{event} {matcher}"
            for event, matcher in expected
            if (event, matcher) not in present
        ]
        if absent:
            missing[harness] = absent
    if not wired:
        return Check("hook events", "skip", "no Trace hook wired in this workspace")
    if not missing:
        return Check("hook events", "pass", f"{wired} harness(es) wire every event")
    return Check(
        name="hook events",
        status="warn",
        detail="wired by an older AgentZero, so these are not captured: "
        + "; ".join(f"{harness}: {', '.join(events)}" for harness, events in missing.items()),
        fix=" && ".join(
            f"{command('adapter materialize')} --harness {harness}" for harness in missing
        ),
    )


def _wired_events(path: Path, *, matchers: bool) -> set[tuple[str, str | None]] | None:
    """(event, matcher) pairs whose hooks run the Trace hook script."""
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(loaded, dict):
        return None
    wired: set[tuple[str, str | None]] = set()
    for event, groups in (loaded.get("hooks") or {}).items():
        for group in groups or []:
            if not isinstance(group, dict):
                continue
            commands = [str(group.get("command") or "")] + [
                str(nested.get("command") or "")
                for nested in group.get("hooks") or []
                if isinstance(nested, dict)
            ]
            if any("write-trace.py" in item for item in commands):
                wired.add((event, group.get("matcher") if matchers else None))
    return wired


def _consume_breadcrumb(breadcrumb: Path, before: int) -> str | None:
    """Read whatever the probe appended, then leave the log as it was found."""
    if not breadcrumb.is_file():
        return None
    text = breadcrumb.read_text(encoding="utf-8")
    added = text[before:].strip()
    if added:
        breadcrumb.write_text(text[:before], encoding="utf-8")
        first = [line.strip() for line in added.splitlines() if line.strip()]
        return first[1] if len(first) > 1 else first[0]
    return None


def _clean_probe(traces: Path, run_id: str) -> None:
    for path in (
        traces / f"{run_id}.yaml",
        traces / ".staging" / f"{run_id}.jsonl",
        traces / ".staging" / f"{run_id}.meta.json",
    ):
        path.unlink(missing_ok=True)


def _check_version_skew(
    workspace: Path, framework_root: Path | None, *, strict: bool
) -> Check:
    severity: Status = "fail" if strict else "warn"
    if framework_root is not None and workspace == framework_root.resolve():
        # The framework checkout is the source of the packages, not a copy of them.
        return Check("version", "skip", "framework checkout; nothing is vendored here")
    stamp = read_stamp(workspace)
    if stamp is None:
        if not (workspace / "src").is_dir():
            return Check("version", "skip", "no vendored runtime to stamp")
        return Check(
            name="version",
            status=severity,
            detail="src/ present but src/VERSION.yaml is missing — origin unknown",
            fix=f"`{command('adapter materialize --force')}`",
        )

    actual = tree_hash(workspace / "src")
    if actual != stamp.get("tree_hash"):
        return Check(
            name="version",
            status=severity,
            detail=(
                "vendored runtime was modified since it was stamped "
                f"({stamp.get('agentzero_version')})"
            ),
            fix=f"keep the edits, or `{command('adapter materialize --force')}` to restore",
        )
    if framework_root is None or not (framework_root / "pyproject.toml").is_file():
        return Check(
            "version",
            "pass",
            f"stamped {stamp.get('agentzero_version')}, unmodified (no framework to compare)",
        )
    current = framework_version(framework_root)
    if str(stamp.get("agentzero_version")) != current:
        return Check(
            name="version",
            status=severity,
            detail=f"workspace carries {stamp.get('agentzero_version')}, framework is {current}",
            fix=f"`{command('adapter materialize')}`",
        )
    return Check("version", "pass", f"{current}, unmodified")


def _check_conventions(workspace: Path, framework_root: Path | None) -> Check:
    """The workspace runs the framework's current System, not the one it was made with.

    `instructions` compares the harness files with the workspace's own System.md, so a
    stale System passed it: the old rules were simply re-emitted (SETTLED #86).
    """
    if framework_root is None or workspace == framework_root.resolve():
        return Check("framework files", "skip", "no framework checkout to compare with")
    if not (framework_root / "template").is_dir():
        return Check("framework files", "skip", "the framework checkout has no template/")
    plan = plan_conventions(workspace, framework_root=framework_root)
    older = [*plan.stale, *(name for name in plan.missing if not name.endswith(".gitkeep"))]
    if not older and not plan.edited:
        return Check("framework files", "pass", "System.md and the rest are current")
    parts = []
    if older:
        parts.append("older than the framework: " + ", ".join(older))
    if plan.edited:
        parts.append("edited here, so materialize will not replace them: " + ", ".join(plan.edited))
    return Check(
        name="framework files",
        status="warn",
        detail="; ".join(parts),
        fix=command("adapter materialize")
        + (" (add --force to replace the edited ones)" if plan.edited else ""),
    )


def _check_memory_shape(workspace: Path) -> Check:
    memory = workspace / "memory"
    if not memory.is_dir():
        return Check(
            name="memory",
            status="warn",
            detail="no memory/ directory — Facts have nowhere to land",
            fix="create memory/ (adapter init does this)",
        )
    graph = memory / "graph.yaml"
    if not graph.is_file():
        # Claiming "graph.yaml parses" when there is none states something that
        # did not happen; the hot set degrades cleanly without it (ADR 0006).
        return Check("memory", "pass", "memory/ present; no graph.yaml (hot set degrades cleanly)")
    try:
        yaml.safe_load(graph.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return Check(
            name="memory",
            status="warn",
            detail=f"memory/graph.yaml does not parse: {exc}",
            fix="open memory/graph.yaml and fix the YAML",
        )
    return Check("memory", "pass", "memory/ present and graph.yaml parses")
