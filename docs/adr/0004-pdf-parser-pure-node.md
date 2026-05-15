# ADR 0004 — PDF parser: pure-Node with bounding-box-aware column sorting

**Status:** Accepted
**Date:** 2026-05-14

## Context

Ingestion starts with PDFs (newspaper editions and website-linked PDFs — see [ADR 0002](./0002-vector-store-libsql.md)). Sample editions in `docs/newspaper-samples/` are the Kißlegger Amtsblatt: digital-native (text layer present), multi-column layouts that vary per page (2-col cover, 4-col official section, 3-col article pages), with section-header styling via colour pills, embedded ads, and the occasional image-rendered poster.

Parser quality is load-bearing for retrieval quality. Bad reading order → scrambled chunks → wasted embeddings. Re-embedding is expensive ([ADR 0003](./0003-embedding-model-bge-m3.md)). Pick deliberately.

Constraints:

- Must run in the Node stack the rest of the project lives in.
- Must respect [ADR 0001](./0001-local-embeddings-for-dsgvo.md) — no document text to non-EU cloud, no managed-service ingest dependency in prod.
- Must produce verifiable output: the text we embed should be provably present in the source PDF (citizens may query against legal Bekanntmachungen — parcel numbers, dates, names where every character matters).
- Reasonable dev-loop speed; we will re-parse during iteration.

## Decision

Use **`unpdf`** (a `pdfjs-dist` wrapper) as the PDF text extractor, plus a small custom **bounding-box-aware column sorter** to fix multi-column reading order.

- pdfjs gives `{ str, transform, width, height, fontName }` per text item — raw text from the PDF's own text layer.
- Column detection: histogram/cluster text-item x-coordinates per page → identify column boundaries.
- Reading order: sort within each column by y, concatenate columns left-to-right.
- Paragraph boundaries: vertical-gap threshold between adjacent text groups in the same column.
- OCR: not in v1. Image-rendered posters (e.g. "MARKTSTAND 09. Mai 2026") are not extracted; documented as a known gap.

## Consequences

- **One language, one runtime.** Stays consistent with the rest of the Mastra stack. No Python container.
- **Verifiable text.** Embedded chunks are byte-equivalent to the PDF text layer. No model interpretation step between source and embedding.
- **Custom code to maintain.** ~100–300 lines of column-sorting and paragraph-detection logic that we own. Test coverage matters.
- **Known gap: image-rendered text** (posters, scanned inserts) is invisible to v1. Mitigated by the fact that body text dominates useful content; revisit when retrieval misses surface this gap.
- **Edge-case fragility.** Irregular layouts (sidebar breakouts, ad rows misaligned with article columns) may need page-specific handling. Acceptable for v1; escape hatch is a future ADR if pure-Node hits a wall.
- **No managed-service cost or rate-limit.** Reparse the full corpus at will during iteration.

## Alternatives considered

- **Docling (Python sidecar, called over HTTP).** Best layout-fidelity for multi-column docs; OCR built-in; reading-order detection maintained upstream. Rejected for v1: adds a third container, a second language runtime, a model cache, and dev-loop friction. Reasonable v2 target if pure-Node fails on real-world layout edge cases — documented as the migration path.
- **MinerU / Marker (Python).** Heavier than Docling, GPU-friendly. Rejected for the same reasons as Docling, with more weight.
- **`pdf-parse` / `pdf2json` (pure-Node).** Older, less actively maintained than pdfjs. No clear advantage over `unpdf`.
- **`mupdf-js` (WASM build of MuPDF).** Reasonable extraction quality. Rejected as a non-default; revisit if pdfjs proves a bottleneck.
- **Vision LLM (Claude, GPT-4o, Pixtral) — whole-PDF or page-by-page parsing.** Strong on layout but: (1) hallucination risk on legal notices is unacceptable for Amtsblatt content (parcel numbers, names, dates), (2) shipping document text to non-EU clouds violates the spirit of [ADR 0001](./0001-local-embeddings-for-dsgvo.md) even though ingest is not strictly the retrieval path, (3) EU vision providers (Mistral Pixtral, Aleph Alpha) reintroduce the managed-service dependency the project is trying to avoid, (4) non-deterministic output breaks reproducibility across re-ingests, (5) cost/latency scales poorly when re-parsing during iteration. The "actual hard problem" being outsourced (column-aware reading order) is solvable in ~100 lines of TS.
- **LlamaParse / Reducto / Unstructured.io cloud.** Best out-of-the-box quality. Rejected on the same DSGVO grounds as the vision LLMs, more emphatically (US cloud).
