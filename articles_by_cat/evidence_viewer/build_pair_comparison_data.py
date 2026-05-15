#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            yield json.loads(line)


def load_articles(path: Path):
    records = {}
    order = []
    for row in iter_jsonl(path):
        pmid = str(next(iter(row))).strip()
        payload = row[pmid]
        order.append(pmid)
        records[pmid] = {
            "pmid": pmid,
            "title": (payload.get("title") or "").strip(),
            "abstract": (payload.get("abstract") or "").strip(),
        }
    return records, order


def load_statements(path: Path):
    records = {}
    for row in iter_jsonl(path):
        pmid = str(row.get("pmid", "")).strip()
        if not pmid:
            continue
        records[pmid] = {
            "pmid": pmid,
            "title": (row.get("title") or "").strip(),
            "abstract": (row.get("abstract") or "").strip(),
            "statements": [str(statement or "").strip() for statement in (row.get("statements") or [])],
        }
    return records


def load_summaries(path: Path):
    summaries = {}
    for row in iter_jsonl(path):
        pmid = str(row.get("source_pmid", "")).strip()
        try:
            idx = int(row.get("statement_idx"))
        except (TypeError, ValueError):
            continue
        if not pmid:
            continue
        summaries[(pmid, idx)] = {
            "support_count": int(row.get("support_count") or 0),
            "contradict_count": int(row.get("contradict_count") or 0),
            "support_summary": str(row.get("support_summary") or "").strip(),
            "contradict_summary": str(row.get("contradict_summary") or "").strip(),
            "support_score": row.get("support_score"),
            "contradict_score": row.get("contradict_score"),
            "conclusion": str(row.get("conclusion") or row.get("notes") or "").strip(),
        }
    return summaries


def load_match_lookup(path: Path):
    lookup = {}
    for row in iter_jsonl(path):
        matched_pmid = str(next(iter(row))).strip()
        payload = row[matched_pmid]
        source_pmid = str(payload.get("retracted_match", "")).strip()
        if not source_pmid:
            continue
        lookup[source_pmid] = {
            "pmid": matched_pmid,
            "title": (payload.get("title") or "").strip(),
            "abstract": (payload.get("abstract") or "").strip(),
        }
    return lookup


def compute_derived_scores(summary):
    try:
        support_score = float(summary["support_score"])
        contradict_score = float(summary["contradict_score"])
    except (TypeError, ValueError):
        return {"controversy_score": None, "directional_score": None}

    total = support_score + contradict_score
    controversy_score = (total * min(support_score, contradict_score)) / 50
    directional_score = None if total == 0 else (support_score - contradict_score) / total
    return {
        "controversy_score": controversy_score,
        "directional_score": directional_score,
    }


def compute_article_metrics(statements):
    ranked_statements = []
    for statement in statements:
        total = int(statement.get("support_count", 0) or 0) + int(
            statement.get("contradict_count", 0) or 0
        )
        contradict_count = int(statement.get("contradict_count", 0) or 0)
        contradict_prop = (contradict_count / total) if total > 0 else None
        if contradict_prop is None:
            continue
        ranked_statements.append(
            {
                "statement": statement,
                "total": total,
                "contradict_count": contradict_count,
                "contradict_prop": contradict_prop,
            }
        )

    if not ranked_statements:
        return {
            "avg_contradiction_prop": None,
            "max_contradiction_prop": None,
            "total_evidence_count": 0,
            "ranked_statement_count": 0,
            "top_statement_idx": None,
            "top_statement_contradict_count": 0,
            "top_statement_total": 0,
            "top_statement_controversy_score": None,
            "top_statement_directional_score": None,
        }

    avg_prop = sum(item["contradict_prop"] for item in ranked_statements) / len(ranked_statements)
    top_statement = max(
        ranked_statements,
        key=lambda item: (
            item["contradict_prop"],
            item["total"],
            item["contradict_count"],
            -int(item["statement"].get("idx", 0)),
        ),
    )

    return {
        "avg_contradiction_prop": avg_prop,
        "max_contradiction_prop": top_statement["contradict_prop"],
        "total_evidence_count": sum(item["total"] for item in ranked_statements),
        "ranked_statement_count": len(ranked_statements),
        "top_statement_idx": top_statement["statement"].get("idx"),
        "top_statement_contradict_count": top_statement["contradict_count"],
        "top_statement_total": top_statement["total"],
        "top_statement_controversy_score": top_statement["statement"].get("controversy_score"),
        "top_statement_directional_score": top_statement["statement"].get("directional_score"),
    }


def build_article_entry(article_meta, statement_meta, summaries):
    if article_meta is None and statement_meta is None:
        return None

    pmid = (statement_meta or article_meta)["pmid"]
    title = (statement_meta or {}).get("title") or (article_meta or {}).get("title") or ""
    abstract = (statement_meta or {}).get("abstract") or (article_meta or {}).get("abstract") or ""
    statement_texts = (statement_meta or {}).get("statements") or []

    statements = []
    for idx, text in enumerate(statement_texts):
        summary = summaries.get((pmid, idx), {})
        derived_scores = compute_derived_scores(summary) if summary else {
            "controversy_score": None,
            "directional_score": None,
        }
        statements.append(
            {
                "idx": idx,
                "text": text,
                "support_count": summary.get("support_count", 0),
                "contradict_count": summary.get("contradict_count", 0),
                "support_summary": summary.get("support_summary", ""),
                "contradict_summary": summary.get("contradict_summary", ""),
                "support_score": summary.get("support_score"),
                "contradict_score": summary.get("contradict_score"),
                "conclusion": summary.get("conclusion", ""),
                "controversy_score": derived_scores["controversy_score"],
                "directional_score": derived_scores["directional_score"],
            }
        )

    metrics = compute_article_metrics(statements)

    return {
        "pmid": pmid,
        "title": title,
        "abstract": abstract,
        "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "statement_count": len(statements),
        "metrics": metrics,
        "statements": statements,
    }


def main():
    parser = argparse.ArgumentParser(description="Build side-by-side comparison data for retracted_rand vs retracted_rand_matches.")
    parser.add_argument("--source-articles", required=True)
    parser.add_argument("--source-statements", required=True)
    parser.add_argument("--source-summaries", required=True)
    parser.add_argument("--match-map", required=True)
    parser.add_argument("--match-statements", required=True)
    parser.add_argument("--match-summaries", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    source_articles, source_order = load_articles(Path(args.source_articles))
    source_statements = load_statements(Path(args.source_statements))
    source_summaries = load_summaries(Path(args.source_summaries))
    match_lookup = load_match_lookup(Path(args.match_map))
    match_statements = load_statements(Path(args.match_statements))
    match_summaries = load_summaries(Path(args.match_summaries))

    pairs = []
    for pair_index, source_pmid in enumerate(source_order, 1):
        match_meta = match_lookup.get(source_pmid)
        matched_pmid = match_meta["pmid"] if match_meta else None
        pairs.append(
            {
                "pair_index": pair_index,
                "source_pmid": source_pmid,
                "matched_pmid": matched_pmid,
                "source_article": build_article_entry(
                    source_articles.get(source_pmid),
                    source_statements.get(source_pmid),
                    source_summaries,
                ),
                "matched_article": build_article_entry(
                    match_meta,
                    match_statements.get(matched_pmid) if matched_pmid else None,
                    match_summaries,
                ),
            }
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pair_count": len(pairs),
        "pairs": pairs,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(pairs)} comparison pair(s) to {out_path}")


if __name__ == "__main__":
    raise SystemExit(main())
