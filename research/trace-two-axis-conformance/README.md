# TRACE two-axis non-interference conformance — executable draft

**Author:** Val Rukhaylo (`altrudev`)  
**Status:** External/informative; not a normative TRACE schema proposal.

This executable harness falsifies one narrow architectural failure mode from `agentrust-io/trace-spec#66`:

> changing action-receipt evidence must not rewrite supply-chain provenance accounting, and changing supply-chain provenance evidence must not rewrite action-receipt accounting.

Overall policy may compose both axes. Evidence accounting must remain truthful and separable.

## Three layers

1. Named reviewer-facing vectors.
2. A deterministic finite cross-product asserting projection invariance in both directions.
3. Six deliberately wrong cross-axis coupling mutants; every mutant must be killed.

The mutants model receipt-from-provenance inference, provenance-from-receipt upgrades, reconstruction from a single success boolean, downgrade erasure, failure erasure, and contradiction laundering.

## Provenance / parallel work

The action-issuance-versus-physical-outcome boundary is being explored independently in TRACE #66, including Akoaidev's proposed cyber-physical vectors. This harness does **not** claim that boundary as novel.

`CONTROL-NEGATIVE-OUTCOME` is retained only as a control input proving that independently valid receipt evidence does not manufacture provenance or get rewritten by the other axis. The contribution here is **cross-axis non-interference plus a mutation gate**.

## Boundary

This does not define final TRACE v1.0 field names, receipt cryptography, replay/freshness semantics, or physical-outcome evidence. It consumes abstract verifier outcomes solely to test architectural independence.

## Run

```bash
python -B -m unittest discover -s tests -v
```

The gate passes only if both projection-invariance directions hold and all committed cross-axis coupling mutants are killed.
