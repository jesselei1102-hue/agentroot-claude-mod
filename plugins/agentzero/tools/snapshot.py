"""Print AgentRoot's memory state as one line of JSON, for the plugin's HUD.

usage: python snapshot.py WORKSPACE   (with PYTHONPATH=WORKSPACE/src)

It reads through the workspace's own AgentRoot modules and writes nothing. It always
exits 0: a failure is reported in the JSON as {"schema": 1, "error": "..."}.
"""
import datetime
import json
import re
import sys
from pathlib import Path

UPGRADE = "this workspace's AgentRoot is too old for the HUD; run /agentroot upgrade"
NO_PYTHON = "no usable Python 3.11 with PyYAML"
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _hot_set(memory_dir: Path):
    import yaml

    try:
        state = yaml.safe_load((memory_dir / "traces" / "hot-set.last").read_text("utf-8"))
    except (OSError, yaml.YAMLError):
        return None
    if not isinstance(state, dict):
        return None
    at = state.get("at")
    if isinstance(at, (datetime.date, datetime.datetime)):
        at = at.isoformat()
    ids = state.get("fact_ids")
    return {
        "at": str(at) if at else None,
        "factIds": [str(i) for i in ids] if isinstance(ids, list) else [],
    }


def _when(created_at: str) -> float:
    try:
        return datetime.datetime.fromisoformat(created_at).timestamp()
    except (TypeError, ValueError):
        return float("-inf")


def _replaced(entries: list, fact) -> "str | None":
    """The sentence of the newest retired Fact the given one replaced: same explicit key, earlier."""
    if not fact.fact_key:
        return None
    older = [
        e
        for e in entries
        if e.status == "retired"
        and e.fact_key == fact.fact_key
        and _when(e.created_at) < _when(fact.created_at)
    ]
    return max(older, key=lambda e: _when(e.created_at)).rule if older else None


def _facts(memory_dir: Path, hot_ids: set) -> list:
    """The active Facts, newest first, as the Memory pane shows them."""
    from memory.lifecycle import parse_entry

    entries = [
        parse_entry(path)
        for path in sorted(memory_dir.glob("*.yaml"))
        if path.name != "graph.yaml"
    ]
    active = sorted(
        (e for e in entries if e.status == "active"), key=lambda e: _when(e.created_at), reverse=True
    )
    return [
        {
            "id": f"fact:{e.id}",
            "sentence": e.rule,
            "said": e.said,
            "author": e.author,
            "createdAt": str(e.created_at) if _DATE.match(str(e.created_at)) else None,
            "scope": e.scope,
            "inHotSet": e.id in hot_ids,
            "factKey": e.fact_key or None,
            "replaces": _replaced(entries, e),
        }
        for e in active
    ]


def snapshot(workspace: Path) -> dict:
    # The plugin may have found a Python that is too old or lacks PyYAML; say that, not "upgrade".
    try:
        import yaml  # noqa: F401
    except ImportError:
        return {"schema": 1, "error": NO_PYTHON}
    if sys.version_info < (3, 11):
        return {"schema": 1, "error": NO_PYTHON}
    try:
        from memory.lifecycle import parse_entry  # noqa: F401
        from memory.review import collect_pending
    except ImportError as exc:
        if (exc.name or "").startswith("memory"):
            return {"schema": 1, "error": UPGRADE}
        raise

    if not (workspace / "memory").is_dir():
        return {"schema": 1, "error": f"no memory/ directory under {workspace}"}
    memory_dir = workspace / "memory"
    pending = collect_pending(workspace)
    hot_set = _hot_set(memory_dir)
    facts = _facts(memory_dir, set(hot_set["factIds"]) if hot_set else set())
    return {
        "schema": 1,
        "active": len(facts),
        "pending": [
            {
                "id": item.qualified_id,
                "kind": item.kind,
                "sentence": item.sentence,
                "provenance": item.provenance,
                "createdAt": str(item.sort_key) if _DATE.match(str(item.sort_key)) else None,
            }
            for item in pending
        ],
        "hotSet": hot_set,
        "facts": facts,
    }


def main(argv: list[str]) -> int:
    try:
        if len(argv) != 1:
            raise ValueError("usage: snapshot.py WORKSPACE")
        result = snapshot(Path(argv[0]))
    except Exception as exc:  # the HUD shows the reason; it must never crash
        message = f"{type(exc).__name__}: {exc}".splitlines()[0]
        result = {"schema": 1, "error": message}
    sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False) + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
