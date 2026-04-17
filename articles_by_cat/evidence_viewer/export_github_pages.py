#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


INCLUDE_PATTERNS = [
    "*.html",
    "*.js",
    "*.css",
    "viewer_data*.json",
    "*_summaries.jsonl",
    "pair_comparison_retracted_rand.json",
    "authors_cache.json",
]


REDIRECT_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=./pubmed-viewer/index.html">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PubMed Evidence Viewer</title>
</head>
<body>
  <p>Redirecting to <a href="./pubmed-viewer/index.html">PubMed Evidence Viewer</a>...</p>
</body>
</html>
"""


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_assets(src_dir: Path, dst_dir: Path) -> list[str]:
    copied: list[str] = []
    for pattern in INCLUDE_PATTERNS:
        for src in sorted(src_dir.glob(pattern)):
            if not src.is_file():
                continue
            shutil.copy2(src, dst_dir / src.name)
            copied.append(src.name)
    return copied


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export the static PubMed viewer as a GitHub Pages-ready bundle."
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Output directory. Defaults to <viewer>/github_pages_site.",
    )
    args = parser.parse_args()

    src_dir = Path(__file__).resolve().parent
    out_dir = Path(args.out_dir).resolve() if args.out_dir else src_dir / "github_pages_site"
    viewer_dir = out_dir / "pubmed-viewer"

    clean_dir(out_dir)
    viewer_dir.mkdir(parents=True, exist_ok=True)

    copied = copy_assets(src_dir, viewer_dir)

    (out_dir / "index.html").write_text(REDIRECT_TEMPLATE, encoding="utf-8")
    (out_dir / ".nojekyll").write_text("", encoding="utf-8")

    print(f"Exported {len(copied)} files to {viewer_dir}")
    for name in copied:
        print(name)
    print(f"Created redirect: {out_dir / 'index.html'}")
    print(f"Created nojekyll marker: {out_dir / '.nojekyll'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
