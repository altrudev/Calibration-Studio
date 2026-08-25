# TRACE two-axis non-interference conformance v0.2

**Author:** Val Rukhaylo (`altrudev`)  
**Status:** External/informative; not a normative TRACE schema proposal.

This executable harness tests one narrow architectural property from `agentrust-io/trace-spec#66`:

> Changing action-receipt evidence must not rewrite supply-chain provenance accounting, and changing supply-chain provenance evidence must not rewrite action-receipt accounting.

Overall appraisal policy may compose both axes. Evidence accounting must remain truthful and separable.

## v0.2 assurance layers

1. **Exact structured-output oracles** for the named reviewer-facing fixtures.
2. **40-state deterministic cross-product**: five provenance states × eight receipt states.
3. **Projection non-interference in both directions** across the complete modeled product.
4. **Six implementation-level broken verifiers**, not post-hoc result rewrites.
5. A mutation gate requiring every broken verifier to be killed by a semantic evidence difference.

The broken implementations model:

- receipt success upgrading provenance depth;
- provenance manufacturing receipt success;
- reconstruction of both axes from one shared success boolean;
- provenance downgrade erasing receipt evidence;
- receipt failure erasing established provenance;
- receipt success laundering a provenance contradiction.

## Important distinction

The non-interference property applies to the factual projections:

```text
fixed P, vary R => provenance_projection(P,R) stays unchanged
fixed R, vary P => receipt_projection(P,R) stays unchanged
```

It does **not** require the overall appraisal to stay unchanged. A policy can legitimately combine the two independent evidence axes.

## Provenance / parallel work

The action-issuance-versus-physical-outcome boundary is being explored independently in TRACE #66, including Akoaidev's proposed cyber-physical vectors. This harness does **not** claim that boundary as novel.

`CONTROL-NEGATIVE-OUTCOME` is retained only as a compatibility/control input. The contribution here is the **cross-axis non-interference property and implementation-level mutation test**.

## Boundary

This artifact does not define final TRACE v1.0 field names, receipt cryptography, replay/freshness semantics, physical-outcome evidence, or normative conformance requirements. It consumes abstract verifier outcomes solely to test the architectural independence property.

## Run

```bash
python -B -m unittest discover -s tests -v
```
