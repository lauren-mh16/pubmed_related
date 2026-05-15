#!/usr/bin/env python3

import argparse
import ast
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


def iter_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, 1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
                continue
            except json.JSONDecodeError:
                pass

            try:
                yield ast.literal_eval(line)
            except Exception as exc:
                print(
                    f"[WARN] Skipping malformed line {line_number} of {path}: {exc}",
                    file=sys.stderr,
                )


def split_article_text(article_text: str) -> Tuple[str, str]:
    text = (article_text or "").strip()
    if not text:
        return "", ""
    if "\n" not in text:
        return "", text
    title, abstract = text.split("\n", 1)
    return title.strip(), abstract.strip()


def score_bucket(score: Optional[int]) -> str:
    if score is None:
        return "unknown"
    if score > 0:
        return "support"
    if score < 0:
        return "contradict"
    return "neutral"


def score_label(score: Optional[int]) -> str:
    mapping = {
        -2: "Strong contradiction",
        -1: "Partial contradiction",
        0: "Neutral / unrelated",
        1: "Partial support",
        2: "Strong support",
        None: "Unknown",
    }
    return mapping.get(score, "Unknown")


def parse_statements(
    path: Path,
    selected_pmids: Optional[Set[str]] = None,
    max_sources: Optional[int] = None,
) -> Dict[str, Dict[str, Any]]:
    sources: Dict[str, Dict[str, Any]] = {}

    for row in iter_jsonl(path):
        pmid = str(row.get("pmid", "")).strip()
        if not pmid:
            continue
        if selected_pmids and pmid not in selected_pmids:
            continue
        if max_sources is not None and pmid not in sources and len(sources) >= max_sources:
            break

        statements = row.get("statements", []) or []
        statement_records = []
        for idx, statement in enumerate(statements):
            statement_records.append(
                {
                    "idx": idx,
                    "text": statement,
                    "counts": {
                        "support": 0,
                        "neutral": 0,
                        "contradict": 0,
                        "unknown": 0,
                        "total": 0,
                    },
                    "evidence": [],
                }
            )

        sources[pmid] = {
            "pmid": pmid,
            "title": (row.get("title") or "").strip(),
            "abstract": (row.get("abstract") or "").strip(),
            "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "statements": statement_records,
        }

    return sources


def maybe_seed_selected_from_scores(
    scores_path: Path,
    source_pmid: Optional[str],
    max_sources: Optional[int],
) -> Optional[Set[str]]:
    if source_pmid:
        return {source_pmid}

    selected: Set[str] = set()
    for row in iter_jsonl(scores_path):
        pmid = str(row.get("source_pmid", "")).strip()
        if not pmid:
            continue
        selected.add(pmid)
        if max_sources is not None and len(selected) >= max_sources:
            break
    return selected


def build_viewer_data(
    statements_path: Path,
    scores_path: Path,
    source_pmid: Optional[str],
    max_sources: Optional[int],
) -> Dict[str, Any]:
    selected_pmids = maybe_seed_selected_from_scores(scores_path, source_pmid, max_sources)
    sources = parse_statements(statements_path, selected_pmids=selected_pmids, max_sources=max_sources)

    if source_pmid and source_pmid not in sources:
        raise ValueError(f"Source PMID {source_pmid} was not found in {statements_path}")

    for row in iter_jsonl(scores_path):
        src_pmid = str(row.get("source_pmid", "")).strip()
        if src_pmid not in sources:
            continue

        try:
            statement_idx = int(row.get("statement_idx"))
        except (TypeError, ValueError):
            continue

        source_entry = sources[src_pmid]
        if statement_idx < 0 or statement_idx >= len(source_entry["statements"]):
            continue

        statement_entry = source_entry["statements"][statement_idx]
        score = row.get("extracted_score")
        if isinstance(score, str):
            try:
                score = int(score)
            except ValueError:
                score = None

        related_pmid = str(row.get("related_pmid", "")).strip()
        related_title, related_abstract = split_article_text(row.get("source", ""))

        evidence_item = {
            "related_pmid": related_pmid,
            "title": related_title or f"Related article {related_pmid or 'unknown'}",
            "abstract": related_abstract,
            "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{related_pmid}/" if related_pmid else "",
            "retrieval_score": row.get("related_score"),
            "score": score,
            "score_label": score_label(score),
            "bucket": score_bucket(score),
            "rationale": (row.get("extracted_rationale") or "").strip(),
            "raw_output": row.get("raw_output"),
        }

        if evidence_item["bucket"] not in {"support", "contradict"}:
            continue

        statement_entry["evidence"].append(evidence_item)
        bucket = evidence_item["bucket"]
        statement_entry["counts"][bucket] += 1
        statement_entry["counts"]["total"] += 1

    for source_entry in sources.values():
        for statement_entry in source_entry["statements"]:
            statement_entry["evidence"].sort(
                key=lambda item: (
                    -(abs(item["score"]) if item["score"] is not None else -1),
                    -(item["score"] if item["score"] is not None else -99),
                    -(item["retrieval_score"] if isinstance(item["retrieval_score"], (int, float)) else -1),
                    item["title"].lower(),
                )
            )

    ordered_sources = sorted(
        sources.values(),
        key=lambda source: (-len(source["statements"]), source["pmid"]),
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(ordered_sources),
        "sources": ordered_sources,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build browser-ready evidence viewer data.")
    parser.add_argument(
        "--statements",
        required=True,
        help="JSONL with source pmid/title/abstract/statements rows.",
    )
    parser.add_argument(
        "--scores",
        required=True,
        help="JSONL with Med-V1 support/contradict outputs.",
    )
    parser.add_argument(
        "--out",
        default=str(Path(__file__).with_name("viewer_data.json")),
        help="Output JSON path for the viewer.",
    )
    parser.add_argument(
        "--source-pmid",
        help="Optional single source PMID to include.",
    )
    parser.add_argument(
        "--max-sources",
        type=int,
        help="Optional maximum number of source articles to include.",
    )
    args = parser.parse_args()

    viewer_data = build_viewer_data(
        statements_path=Path(args.statements),
        scores_path=Path(args.scores),
        source_pmid=args.source_pmid,
        max_sources=args.max_sources,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(viewer_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {viewer_data['source_count']} source article(s) to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
