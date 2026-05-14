# ADR 0001 — Local embeddings required for DSGVO-defensible deployment

**Status:** Accepted
**Date:** 2026-05-14

## Context

Target deployment is German municipalities (Städte/Kommunen). Newspaper and website content is statutorily public (the Amtsblatt is published by the city itself), so the ingestion-side data is low-risk. The **query-side** is not: citizen questions can contain personal data — names, addresses, identifying details about their interactions with the municipality.

Under DSGVO/GDPR, any cloud embedding call carries query text out of the EU when the provider is US-based (OpenAI, Cohere, Voyage, etc.). That triggers Art. 6 (lawful basis), Art. 28 (processor agreement), and Art. 44ff (third-country transfers). The EU-US Data Privacy Framework helps, but German DPAs and municipal procurement (BSI C5, IT-Grundschutz) remain cautious about US providers — many won't approve them at all.

A managed RAG service (Ragie, Pinecone Assistant, etc.) hides this transfer inside its own pipeline and is the same problem one layer down.

## Decision

**No document or query text may flow to a non-EU cloud provider for embedding.**

Embeddings run locally — initially via Ollama on the same host as the application — using an open-weights model. The specific model is chosen in [ADR 0003](./0003-embedding-model-bge-m3.md).

The LLM call is a separate decision and remains swappable; it is not bound by this ADR (see project README "swap before production" note).

## Consequences

- **Operations cost:** Ollama or an equivalent local runtime must run alongside the app. In Docker Compose this is one extra container plus a model-cache volume.
- **Quality ceiling:** open-weights multilingual embedding models are competitive with OpenAI's `text-embedding-3-small` but not always with `-large`. For German municipal content (formal Hochdeutsch + administrative jargon) this is acceptable; if quality issues appear, the answer is a better local model, not a US cloud provider.
- **No leakage by accident:** because there is no cloud-embedding code path, a future developer cannot silently add one without an explicit ADR change.
- **Re-embedding cost is real.** Any model change requires re-embedding the full corpus. Choosing the right model up-front matters (see ADR 0003).

## Alternatives considered

- **OpenAI `text-embedding-3-small` (with EU data residency + DPA).** Cheap, high quality, supports German. Rejected: even with EU residency, the underlying processor remains a US company, which triggers CLOUD Act / FISA 702 concerns and fails most municipal procurement reviews.
- **Cohere Embed (EU endpoint).** Better legal posture than OpenAI but still a non-EU controller. Same procurement problem.
- **Mistral Embed (EU-hosted).** Genuinely EU-hosted with Mistral as data controller. Would satisfy DSGVO but is a managed dependency we'd carry into prod. Self-hosting is strictly more learnable and strictly cheaper at small scale.
- **Aleph Alpha embeddings.** German company, defensible legal posture, but commercial and not open-weights. Same managed-dependency objection.
