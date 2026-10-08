"""Bring a forgotten Fact back, as it was: the Memory pane's Restore.

usage: python restore.py WORKSPACE fact:<id>   (with PYTHONPATH=WORKSPACE/src)

AgentZero's forget retires a Fact and keeps its file; the kernel has no command to undo
that. This sets the status back to active through the kernel's own entry writer, so the
id, words and dates are the ones the operator forgot. It refuses when a newer Fact with
the same fact-key replaced it since: two would then contradict.
"""
import sys
from dataclasses import replace
from pathlib import Path


def restore(workspace: Path, target: str) -> str:
    from memory import lifecycle

    identifier = target[len("fact:"):] if target.startswith("fact:") else target
    memory_dir = workspace / "memory"
    path = memory_dir / f"{identifier}.yaml"
    if not identifier or "/" in identifier or not path.is_file():
        raise ValueError(f"no Fact {target} in {memory_dir}")
    entry = lifecycle.parse_entry(path)
    if entry.status != "retired":
        raise ValueError(f"fact:{entry.id} is not forgotten (status {entry.status})")
    for other_path in sorted(memory_dir.glob("*.yaml")):
        if other_path == path or other_path.name == "graph.yaml":
            continue
        other = lifecycle.parse_entry(other_path)
        if other.status == "active" and other.effective_fact_key == entry.effective_fact_key:
            raise ValueError(f"a newer Fact replaced it: {other.rule}")
    lifecycle._write(path, replace(entry, status="active"))
    return f"restored: fact:{entry.id} — {entry.rule}\n"


def main(argv: list[str]) -> int:
    try:
        if len(argv) != 2:
            raise ValueError("usage: restore.py WORKSPACE fact:<id>")
        out = restore(Path(argv[0]), argv[1])
    except Exception as exc:  # the pane shows the first line
        sys.stderr.buffer.write(f"{exc}\n".encode("utf-8"))
        return 1
    sys.stdout.buffer.write(out.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
