import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
KERNEL_SRC = ROOT / "plugins/agentzero/kernel/src"
SCRIPT = ROOT / "plugins/agentzero/tools/restore.py"


def _env(pythonpath):
    env = dict(os.environ)
    env["PYTHONPATH"] = str(pythonpath)
    return env


@pytest.fixture
def ws(tmp_path):
    workspace = tmp_path / "ws"
    subprocess.run(
        [sys.executable, "-m", "adapter", "init", str(workspace), "--harness", "claude"],
        check=True, capture_output=True, env=_env(KERNEL_SRC),
    )
    return workspace


def mem(ws, *args):
    return subprocess.run(
        [sys.executable, "-m", "memory", *args],
        check=True, capture_output=True, cwd=ws, env=_env(ws / "src"),
    ).stdout.decode("utf-8")


def restore(ws, fact_id):
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(ws), fact_id], capture_output=True, env=_env(ws / "src"),
    )


def fact_id(out):
    return "fact:" + out.split("remembered: ")[1].split(" ")[0]


def status(ws, fid):
    return yaml.safe_load((ws / "memory" / f"{fid[len('fact:'):]}.yaml").read_text("utf-8"))["status"]


def test_a_forgotten_fact_comes_back_as_it_was(ws):
    fid = fact_id(mem(ws, "remember", "Use pnpm, never npm.", "--said", "Use pnpm, never npm."))
    mem(ws, "forget", fid)
    done = restore(ws, fid)
    assert done.returncode == 0
    assert done.stdout.decode("utf-8").startswith(f"restored: {fid} — Use pnpm, never npm.")
    assert status(ws, fid) == "active"
    data = yaml.safe_load((ws / "memory" / f"{fid[5:]}.yaml").read_text("utf-8"))
    assert data["said"] == "Use pnpm, never npm." and data["author"] == "human"


def test_a_fact_replaced_since_is_not_restored(ws):
    old = fact_id(mem(ws, "remember", "Deploy on Tuesdays.", "--said", "Deploy on Tuesdays.", "--fact-key", "deploy-day"))
    mem(ws, "remember", "Deploy on Thursdays.", "--said", "Deploy on Thursdays.", "--fact-key", "deploy-day")
    done = restore(ws, old)
    assert done.returncode == 1
    assert "a newer Fact replaced it: Deploy on Thursdays." in done.stderr.decode("utf-8")
    assert status(ws, old) == "retired"


def test_an_active_or_unknown_fact_is_refused(ws):
    fid = fact_id(mem(ws, "remember", "Use pnpm.", "--said", "Use pnpm."))
    assert restore(ws, fid).returncode == 1
    assert "is not forgotten" in restore(ws, fid).stderr.decode("utf-8")
    assert "no Fact" in restore(ws, "fact:nope").stderr.decode("utf-8")
