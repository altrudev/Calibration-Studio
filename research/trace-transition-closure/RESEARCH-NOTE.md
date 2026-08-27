# Predecessor Binding and Transition Conformance in TRACE

**Author:** Val Rukhaylo (`altrudev`)  
**Date:** 2026-08-25  
**Status:** Research note / informative. This document does not claim an accepted TRACE requirement or normative change.

## Question

A verifier can establish several useful facts without establishing the same claim:

1. **approval validity** — an attributable authorization artifact is valid;
2. **approval consumption** — an execution is linked to the authorization that was consumed;
3. **execution validity** — the recorded action/execution evidence verifies under its own rules;
4. **transition validity** — the resulting state transition stayed within the context and authority actually approved.

TRACE #191 now records two related scope questions from the discussion as open questions:

- **Predecessor binding:** can a verifier determine that the consumed approval was evaluated against the predecessor context represented by the execution evidence?
- **Transition conformance:** can a verifier determine that the observed successor stayed within the approved resource/effect envelope?

These questions should remain separate. The first asks whether the authorization basis stayed applicable. The second asks whether the resulting state change stayed inside the authority granted.

## Why the distinction matters

Consider:

```text
S0 -> approve(action A, scope R, effects E)
S0 -> S0' before execution
A executes against S0'
S0' -> S1
```

Approval for `A` may still be cryptographically valid and the execution record may still identify `A`, while neither fact by itself establishes that the approver evaluated `S0'` or that `S1` remained inside the approved transition envelope.

A useful assurance model therefore avoids collapsing:

```text
approval validity != approval consumption != execution validity != transition validity
```

## Executable exercise

The external prototype in [Calibration-Studio PR #7](https://github.com/altrudev/Calibration-Studio/pull/7) keeps TRACE attestation independent and uses the existing assurance-neutral `references` mechanism to bind an external `AuthorizationContext` containing:

- `decision_id`;
- action digest;
- predecessor digest;
- policy digest;
- allowed resources;
- allowed effects;
- validity window;
- optional expected successor digest.

The closure verifier then compares that context with independently verified observed-transition evidence. Its result is separate from TRACE attestation:

```text
TRACE attestation       external evidence verification
        \                 /
         \               /
          +-- closure ---+
              |
    VERIFIED | FAILED | INDETERMINATE
```

A relying consumer must not read `closure == VERIFIED` as a standalone trust verdict. For this prototype the composition rule is:

```text
valid TRACE attestation covering references
AND independently verified external evidence
AND closure VERIFIED
```

## What external review established

Independent reviewers cloned and executed the prototype rather than reviewing only the prose. Their work established several points relevant to the research question:

- the prototype's initial test gates were reproducible but did not defend every decision join;
- mutation/guard-neutralization testing exposed those weakly guarded decisions;
- the current PIC/TRACE bridge experiment reported no world-state/predecessor input, supporting the interpretation that predecessor/context binding is an additional composition layer rather than implicit in the action digest;
- TRACE's rule that resolved references are not automatically attested evidence is load-bearing for the composition boundary.

These are observations from the public review record, not claims that TRACE has accepted predecessor binding or transition conformance as normative scope.

## Minimal candidate fixtures

The smallest useful conformance set for the open questions appears to be:

| Fixture | Authorization context | Execution / successor | Expected closure reading |
|---|---|---|---|
| Baseline | exact predecessor, policy and envelope | within envelope | eligible for `VERIFIED` when all independent evidence verifies |
| Stale predecessor | valid authorization for `S0` | execution binds `S0'` | `FAILED` |
| Context digest mismatch | referenced context differs from resolved context | otherwise consistent | `FAILED` |
| Resource expansion | valid context | touches resource outside approved set | `FAILED` |
| Effect expansion | valid context | produces effect outside approved set | `FAILED` |
| Evidence unresolved | authorization/observation cannot be independently established | no demonstrated contradiction | `INDETERMINATE` |

The requirements discussion has specifically recorded stale predecessor, authorization-context digest mismatch, and a valid context with an out-of-envelope successor as candidate fixtures. The table above keeps those cases separate from evidence-availability failures.

## Non-goals

This note does **not** propose that TRACE become an application-state database. It does not treat a resolved reference as attested truth, does not redefine TRACE record validity, does not claim ownership/authorship from provenance evidence, and does not assert that a physical or business-world outcome occurred merely because computational evidence is internally consistent.

## Open design questions

1. Is predecessor binding in TRACE scope, an informative profile, or intentionally an application-layer composition concern?
2. If transition conformance is in scope, what is the smallest interoperable evidence commitment: predecessor digest only, predecessor + successor, or a bounded resource/effect transition envelope?
3. Which time should an offline verifier use when authorization validity is time-bounded, and where is that evaluation time cryptographically bound?
4. Should conformance distinguish malformed/invalid provenance, authorization denial, and valid negative outcome as separate result classes across related AgenTrust specifications?

## Evidence and provenance

Primary public record:

- TRACE requirements discussion: `agentrust-io/trace-spec#191`
- external executable prototype and independent review: `altrudev/Calibration-Studio#7`
- TRACE references mechanism: `agentrust-io/trace-spec#197`

The prototype and this note are external research artifacts. Maintainer comments that record questions or candidate fixtures are evidence that the questions entered the requirements discussion; they are **not** evidence that the questions have been accepted as TRACE requirements.
