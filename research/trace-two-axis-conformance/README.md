# TRACE two-axis non-interference conformance v0.3

**Author:** Val Rukhaylo (`altrudev`)  
**Status:** External/informative; not a normative TRACE schema proposal.

This harness tests a narrow architectural property from `agentrust-io/trace-spec#66`: evidence on one verification axis must not manufacture, erase, or rewrite evidence on the other.

## v0.3

The factual projections now include **axis-scoped reasons and abstract evidence anchors**, not only primary result fields:

```text
provenance projection =
  depth + result + provenance reasons + provenance anchors

receipt projection =
  result + receipt reasons + receipt anchors
```

The global `reasons` list remains available for composed appraisal, but it is no longer the only explanation channel.

The finite model contains 6 provenance states × 8 receipt states = **48 states**.

Each deliberately broken verifier is assigned to a **named invariant** that it must violate over that product:

- provenance projection non-interference;
- receipt projection non-interference;
- contradiction preservation.

This makes a mutation kill causal: a mutant is not considered killed merely because some output differs.

## Policy composition boundary

Overall appraisal may legitimately change when the other axis changes. Non-interference applies to evidence accounting, explanations, and anchors—not to the final composed policy verdict.

## Provenance / parallel work

The action-issuance-versus-physical-outcome boundary is being explored independently in TRACE #66, including Akoaidev/Aizismi's cyber-physical vectors. This harness does not claim that surface as novel.

## Boundary

No final TRACE v1.0 field names, clause-anchor vocabulary, receipt cryptography, replay/freshness semantics, or normative conformance requirement is proposed here. `evidence_anchors` are intentionally abstract placeholders so the property can later map to whatever clause/evidence identifiers maintainers settle on.

## Run

```bash
python -B -m unittest discover -s tests -v
```
