"""Render README demo GIFs into docs/."""

from __future__ import annotations

from gif_features_a import RENDERERS as CORE
from gif_features_b import RENDERERS as SITES
from gif_intro import render_setup, render_usage
from gif_lib import DOCS


def main() -> None:
    jobs = [render_setup, render_usage, *CORE, *SITES]
    for fn in jobs:
        fn()
    print(f"{len(jobs)} GIFs:")
    for path in sorted(DOCS.glob("*.gif")):
        print(f"  {path.name:22s}  {path.stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
