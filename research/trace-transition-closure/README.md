# TRACE Authorization-to-Transition Closure Prototype

**Status:** experimental / informative; not a TRACE normative change.

This prototype tests the transition-closure gap discussed around `agentrust-io/trace-spec#191`, composed with TRACE's assurance-neutral `references` mechanism from #197.

TRACE can attest a runtime record and point to external `authorized-intent` / `approval-outcome` facts. This prototype asks a separate question:

> Did execution occur against the same authorization context the decision-maker evaluated, and did the resulting transition stay inside the granted policy, resource, effect, time, and predecessor envelope?

## Core boundary

- TRACE attestation validity is independent.
- External evidence authenticity is independent.
- Authorization-to-transition closure is `VERIFIED`, `FAILED`, or `INDETERMINATE`.
- A closure result is never a substitute for TRACE signature/attestation verification.

A relying consumer should require all three:

`valid TRACE attestation covering references AND closure VERIFIED AND external evidence verified`

## Candidate composition

```text
AuthorizationContext/0.3
  decision_id
  action_digest
  predecessor_digest
  policy_digest
  resource/effect envelope
  validity window
        |
        | digest-bound authorized-intent reference
        v
TRACE Trust Record ----------------> independent TRACE attestation
        |
        +---- approval-outcome reference (optional profile)
        |
        v
ObservedTransition/0.3
        |
        v
Closure verifier
  VERIFIED | FAILED | INDETERMINATE
```

## Run

```bash
python -m pytest research/trace-transition-closure/tests/ -q
```

The implementation uses only the Python standard library.

## External review lineage

After v0.2, GitHub contributor `lywinged` independently cloned and ran PR #7, reproduced the 20/20 gate, exercised the TRACE/PIC bridge, and identified missing test guards plus six additional implementation edge cases. Their original 12-test artifact is retained unchanged as `tests/test_missing_guards.py`; attribution and provenance are the PR #7 review thread, comment `#issuecomment-5394526168`.

The rebuilt mutation script they supplied is treated as a description of method, not as the original historical artifact, because the original container was reclaimed. We do not conflate those provenance classes.

## v0.3 external-review hardening

v0.3 incorporates the reproduced findings:

- boolean timestamps no longer pass as integers;
- authorization validity is half-open: `not_before <= executed_at < expires_at`;
- zero-width windows are rejected;
- a proven contradiction cannot be demoted to `INDETERMINATE` by later missing evidence;
- TRACE-compatible lowercase SHA-256 and SHA-384 reference digests are supported;
- malformed `references` are diagnosed separately from absent references;
- context integers are bounded to `2^53 - 1` for cross-language interoperability;
- the trust-composition rule is explicit: closure cannot be consumed independently of valid TRACE attestation covering `references`.

Post-fix local gate: **48/48 passing**. The verifier module reaches **100% branch-inclusive coverage** under the combined suite.

## Scope boundary

This prototype does **not** modify TRACE wire format, treat resolved references as attested truth, invalidate TRACE because a reference cannot be resolved, or verify TRACE signatures itself. It remains a composition layer.
