#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


GITHUB_PAGES_CSS_NAME = "github_pages.css"
GITHUB_PAGES_CSS_VERSION = "20260427a"

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

GITHUB_PAGES_FALLBACK_CSS = """
/* Self-contained fallback styling for GitHub Pages exports.
   The local viewer leans on NCBI's remote PubMed CSS bundle, but the
   exported site should remain readable and well-laid-out even if those
   assets fail to load or change. */

html {
  font-size: 16px;
}

body {
  line-height: 1.5;
}

img {
  max-width: 100%;
  height: auto;
}

.usa-skipnav {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.usa-skipnav:focus {
  left: 16px;
  top: 16px;
  width: auto;
  height: auto;
  padding: 10px 14px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--viewer-border-dark);
  z-index: 2000;
}

.usa-banner {
  background: #edf3f9;
  border-bottom: 1px solid var(--viewer-border);
  font-size: 0.92rem;
}

.usa-banner-header,
.usa-banner-content,
.ncbi-header .usa-grid,
.viewer-search-form .inner-wrap {
  max-width: 1260px;
  margin: 0 auto;
  padding-left: 28px;
  padding-right: 28px;
}

.usa-banner-header {
  padding-top: 10px;
  padding-bottom: 10px;
}

.usa-banner-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.usa-banner-inner > p {
  margin: 0;
}

.usa-banner-inner > img,
.usa-banner-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.usa-banner-button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--viewer-link);
  font: inherit;
  cursor: pointer;
}

.usa-banner-content {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding-top: 0;
  padding-bottom: 14px;
}

.usa-width-one-half,
.usa-width-one-whole {
  min-width: 0;
}

.usa-width-one-half {
  display: flex;
  gap: 12px;
}

.usa-media_block-body > p {
  margin: 0;
}

.usa-overlay {
  display: none;
}

.ncbi-header {
  background: #20558a;
  color: #fff;
}

.ncbi-header .usa-grid {
  padding-top: 14px;
  padding-bottom: 14px;
}

.usa-width-one-whole {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ncbi-header__logo img {
  display: block;
  height: 42px;
  width: auto;
}

.logo {
  display: inline-flex;
}

.usa-button,
.header-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: #fff;
  color: #20558a;
  font-weight: 600;
  text-decoration: none;
}

.viewer-search-form .inner-wrap {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 20px;
  align-items: center;
  padding-top: 22px;
  padding-bottom: 12px;
}

.pubmed-logo {
  display: inline-flex;
}

.pubmed-logo img {
  display: block;
  height: 44px;
  width: auto;
}

.search-input {
  min-width: 0;
}

.form-field {
  display: flex;
  align-items: stretch;
}

.term-input {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--viewer-border-dark);
  border-right: 0;
  border-radius: 10px 0 0 10px;
  background: #fff;
  font: inherit;
}

.search-btn {
  min-width: 112px;
  padding: 0 16px;
  border: 1px solid var(--viewer-border-dark);
  border-radius: 0 10px 10px 0;
  background: var(--viewer-blue);
  color: #fff;
  font: inherit;
  font-weight: 600;
}

.search-links-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-self: end;
}

.search-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.search-input-link {
  font-size: 0.95rem;
}

.article-page {
  max-width: 1320px;
  margin: 0 auto;
  padding: 28px 42px 42px;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}

.page-sidebar {
  min-width: 0;
}

.page-sidebar .inner-wrap {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-sidebar .title,
.article-details > .heading .heading-title,
.article-details > .abstract > .title,
.article-details > .viewer-section > .title,
.article-details > .viewer-placeholder-section > .title,
.viewer-dialog-body .references > .title,
.viewer-dialog-body #evidenceTitle,
#rankingStatementDialogTitle {
  margin: 0 0 12px;
}

.actions-buttons,
.page-navigator,
.article-details > .heading,
.article-details > .abstract,
.article-details > .viewer-section,
.article-details > .viewer-placeholder-section,
.viewer-dialog-body .references {
  border: 1px solid var(--viewer-border);
  border-radius: 12px;
  background: #fff;
  padding: 20px;
}

.actions-buttons .inner-wrap {
  display: flex;
  flex-direction: column;
}

.items-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.items-list a {
  text-decoration: none;
}

.article-details {
  min-width: 0;
}

.full-view {
  min-width: 0;
}

.heading-title {
  font-size: 1.9rem;
  line-height: 1.25;
  font-weight: 700;
}

.identifiers {
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
}

.identifiers li {
  margin: 0;
}

.inline-authors {
  margin-top: 14px;
}

.authors-list {
  display: flex;
  flex-wrap: wrap;
}

.abstract-content,
.viewer-placeholder-text,
.viewer-section__intro,
.viewer-evidence-card__abstract,
.viewer-evidence-card__rationale,
.viewer-article-ranking-card__excerpt,
.viewer-compare-statement__text {
  font-size: 1rem;
  line-height: 1.7;
}

.viewer-page-tab {
  font-size: 1rem;
}

.viewer-placeholder-text,
.viewer-section__intro {
  margin-top: 0;
}

#statement-support .viewer-section__intro,
.viewer-dialog-body #evidenceSubtitle {
  font-size: 1rem;
  line-height: 1.65;
}

.viewer-statement-card__header,
.viewer-statement-card__legend {
  font-size: 0.95rem;
}

.viewer-statement-card__text,
#statement-support .viewer-statement-card__text {
  font-size: 1.08rem;
  line-height: 1.65;
}

.viewer-statement-summary__section h4 {
  font-size: 0.95rem;
  font-weight: 700 !important;
}

.viewer-statement-summary__section p,
.viewer-statement-summary__empty {
  font-size: 0.98rem;
}

.viewer-group-title {
  font-size: 1.2rem;
}

.viewer-filter-chip {
  font-size: 0.95rem;
}

.viewer-evidence-card__title {
  font-size: 1.05rem;
}

.viewer-evidence-card__meta {
  font-size: 0.9rem;
}

.viewer-score-pill {
  font-size: 0.78rem;
}

.viewer-ranking-layout {
  padding-top: 28px;
}

.viewer-overlay .dialog {
  max-width: 1120px;
}

@media (max-width: 960px) {
  .viewer-search-form .inner-wrap,
  .article-page {
    grid-template-columns: 1fr;
  }

  .search-links-wrapper {
    justify-self: stretch;
  }

  .article-page {
    padding-left: 26px;
    padding-right: 26px;
  }

  .page-sidebar {
    position: static;
  }
}

@media (max-width: 700px) {
  .usa-banner-header,
  .usa-banner-content,
  .ncbi-header .usa-grid,
  .viewer-search-form .inner-wrap,
  .viewer-control-strip,
  .viewer-page-tabs {
    padding-left: 16px;
    padding-right: 16px;
  }

  .usa-banner-content {
    grid-template-columns: 1fr;
  }

  .usa-width-one-whole,
  .usa-banner-inner,
  .viewer-search-form .inner-wrap {
    align-items: flex-start;
  }

  .article-page {
    padding-left: 16px;
    padding-right: 16px;
  }

  .heading-title {
    font-size: 1.5rem;
  }

  .term-input {
    min-height: 44px;
  }

  .search-btn {
    min-width: 92px;
  }
}
"""


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def build_github_pages_css(src_dir: Path) -> str:
    base_styles = (src_dir / "styles.css").read_text(encoding="utf-8")
    return f"{base_styles}\n\n{GITHUB_PAGES_FALLBACK_CSS.lstrip()}"


def rewrite_html_for_github_pages(html_text: str) -> str:
    out_lines: list[str] = []
    inserted_stylesheet = False
    stylesheet_line = (
        f'  <link rel="stylesheet" href="./{GITHUB_PAGES_CSS_NAME}?v={GITHUB_PAGES_CSS_VERSION}" '
        'type="text/css">'
    )

    for line in html_text.splitlines():
        stripped = line.strip()
        if stripped.startswith('<link rel="stylesheet" href="https://cdn.ncbi.nlm.nih.gov/pubmed/'):
            continue
        if stripped.startswith('<link rel="stylesheet" href="./styles.css'):
            if not inserted_stylesheet:
                out_lines.append(stylesheet_line)
                inserted_stylesheet = True
            continue
        out_lines.append(line)

    if not inserted_stylesheet:
        rewritten: list[str] = []
        for line in out_lines:
            if line.strip() == "</head>":
                rewritten.append(stylesheet_line)
                inserted_stylesheet = True
            rewritten.append(line)
        out_lines = rewritten

    return "\n".join(out_lines) + "\n"


def copy_assets(src_dir: Path, dst_dir: Path) -> list[str]:
    copied: list[str] = []
    for pattern in INCLUDE_PATTERNS:
        for src in sorted(src_dir.glob(pattern)):
            if not src.is_file():
                continue
            shutil.copy2(src, dst_dir / src.name)
            copied.append(src.name)
    return copied


def rewrite_exported_html(viewer_dir: Path) -> list[str]:
    rewritten: list[str] = []
    for html_path in sorted(viewer_dir.glob("*.html")):
        html_path.write_text(
            rewrite_html_for_github_pages(html_path.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        rewritten.append(html_path.name)
    return rewritten


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
    (viewer_dir / GITHUB_PAGES_CSS_NAME).write_text(
        build_github_pages_css(src_dir),
        encoding="utf-8",
    )
    rewrite_exported_html(viewer_dir)
    copied.append(GITHUB_PAGES_CSS_NAME)

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
