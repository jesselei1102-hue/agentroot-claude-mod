"""The Trace hook script every harness adapter copies into its hooks folder."""

from __future__ import annotations

import shutil
from pathlib import Path

_ASSETS = Path(__file__).resolve().parent / "assets"
_RETIRED = ("write-trace.sh", "write-trace.cmd")
"""Shell wrappers no hook config has called since every adapter wired the `.py` script
directly (SETTLED #38). Removed from workspaces that an older AgentZero gave them to."""


def install_hook_script(hooks_dir: Path) -> None:
    """Copy the hook assets into `hooks_dir`, and drop the retired wrappers left there."""
    hooks_dir.mkdir(parents=True, exist_ok=True)
    for asset in _ASSETS.iterdir():
        if asset.is_file():
            shutil.copy2(asset, hooks_dir / asset.name)
    for name in _RETIRED:
        (hooks_dir / name).unlink(missing_ok=True)
