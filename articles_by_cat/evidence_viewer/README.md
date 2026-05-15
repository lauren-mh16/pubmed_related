# Evidence Viewer

This folder contains a small local viewer for article-level evidence attribution outputs.

It expects:
- a `statements` JSONL file with rows like `{"pmid": "...", "title": "...", "abstract": "...", "statements": [...]}`,
- a `scores` JSONL file with Med-V1 outputs containing `source_pmid`, `statement_idx`, `related_pmid`, `extracted_score`, and `extracted_rationale`.

## Build viewer data

```bash
python articles_by_cat/evidence_viewer/build_viewer_data.py \
  --statements articles_by_cat/retracted_statements.jsonl \
  --scores articles_by_cat/retracted_out.jsonl \
  --source-pmid 12077603 \
  --out articles_by_cat/evidence_viewer/viewer_data.json
```

You can swap in other files from `articles_by_cat`, for example `tiny_statements.jsonl` and `tiny_out.jsonl`.

Examples using your existing Med-V1 outputs:

```bash
python articles_by_cat/evidence_viewer/build_viewer_data.py \
  --statements articles_by_cat/sample_sig_100_statements.jsonl \
  --scores articles_by_cat/test_10.jsonl \
  --out articles_by_cat/evidence_viewer/viewer_data_test10_all.json
```

```bash
python articles_by_cat/evidence_viewer/build_viewer_data.py \
  --statements articles_by_cat/sample_sig_100_statements2.jsonl \
  --scores articles_by_cat/test_10_2.jsonl \
  --out articles_by_cat/evidence_viewer/viewer_data_test10_2_all.json
```

For the PubMed-related ophthalmology viewer, keep the source article metadata and
statements from `oph1_statements.jsonl`; only the scored evidence rows come from
`oph1_pubmed_out.jsonl`:

```bash
python articles_by_cat/evidence_viewer/build_viewer_data.py \
  --statements articles_by_cat/oph1_statements.jsonl \
  --scores articles_by_cat/oph1_pubmed_out.jsonl \
  --out articles_by_cat/evidence_viewer/viewer_data_oph1_pubmed.json
```

The current prebuilt files in this folder are:
- `viewer_data.json`: 91 source PMIDs from `retracted_out.jsonl`
- `viewer_data_test10_all.json`: 10 source PMIDs from `test_10.jsonl`
- `viewer_data_test10_2_all.json`: 10 source PMIDs from `test_10_2.jsonl`
- `viewer_data_test10_5_4_all.json`: 10 source PMIDs from `test_10_5.4.jsonl`
- `viewer_data_oph1_pubmed.json`: source PMIDs/statements from `oph1_statements.jsonl`, PubMed-related evidence from `oph1_pubmed_out.jsonl`

## Serve locally

```bash
python articles_by_cat/evidence_viewer/server.py --port 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

To load a different built dataset without replacing `viewer_data.json`, pass a query parameter:

```text
http://127.0.0.1:8000/?data=viewer_data_test10_all.json
http://127.0.0.1:8000/?data=viewer_data_test10_2_all.json
http://127.0.0.1:8000/?data=viewer_data_test10_5_4_all.json
http://127.0.0.1:8000/?data=viewer_data_oph1_pubmed.json
```

Use the `Dataset` dropdown in the header to switch between output files, and the `Source article` dropdown to switch between PMIDs inside that dataset.
