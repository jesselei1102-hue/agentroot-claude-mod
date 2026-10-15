"""Where the framework's own files are: this checkout, or the copy an installed package carries.

`init` copies `template/`, and `materialize` compares a workspace against the framework's
`src/`, launchers and `pyproject.toml` version. A checkout has them at its root. An
installed package (`uv tool install`, `pipx`) has no checkout, so the wheel carries the
same files under `adapter/_framework/`, laid out the same way (see pyproject.toml), and
an operator stands a workspace without cloning the repository.
"""

from __future__ import annotations

from pathlib import Path

_CHECKOUT = Path(__file__).resolve().parents[2]
_PACKAGED = Path(__file__).resolve().parent / "_framework"


def _is_framework(root: Path) -> bool:
    return (root / "pyproject.toml").is_file() and (root / "template").is_dir()


FRAMEWORK_ROOT = _CHECKOUT if _is_framework(_CHECKOUT) else _PACKAGED
