# TRACE Authorization-to-Transition Closure Prototype

**Status:** experimental / informative; not a TRACE normative change.

This prototype tests a narrow gap discussed around `agentrust-io/trace-spec#191` after TRACE added the assurance-neutral `references` mechanism in #197.

TRACE can attest a runtime record and can now point to an external `authorized-intent` or `approval-outcome`. This prototype asks a different question:

> Did the recorded execution occur against the same authorization context the approver evaluated, and did the observed transition remain inside the authority/resource/mutation envelope that was granted?

It deliberately keeps two results separate:

- **TRACE attestation validity** — belongs to TRACE and is not redefined here.
- **Authorization-to-transition closure** — `VERIFIED`, `FAILED`, or `INDETERMINATE`.

## Core distinctions

- Approval validity != approval consumption
- Approval consumption != execution validity
- Execution validity != transition validity
- Action identity != authorization context
- Same nominal action != same authorized transition
- TRACE reference != attested truth of the referenced object

## Candidate composition

```text
AuthorizationContext/0.2
  decision_id
  action_digest
  predecessor_digest
  resource_scope
  mutation_envelope
  policy_digest
  validity

        |
        | digest-bound TRACE reference:
        | rel = authorized-intent
        v

TRACE Trust Record ---------> independent runtime attestation
        |
        +---- approval-outcome reference
        |
        v
ObservedTransition/0.2

        |
        v
Closure verifier
  VERIFIED | FAILED | INDETERMINATE
```

## Run

```bash
python -m unittest discover -s research/trace-transition-closure/tests -v
```

The implementation uses only the Python standard library.

## Scope boundary

This prototype does **not**:
- modify TRACE wire format;
- assert that a resolved TRACE `reference` becomes attested evidence;
- invalidate a TRACE Trust Record when an external reference cannot be resolved;
- claim that all application state can or should be represented by TRACE.

It is intentionally a composition layer.

## v0.2 DDC hardening

The post-build DDC audit found that v0.1 could over-promote matching but unverified external objects to `VERIFIED`. v0.2 closes that evidence-inflation path and adds ambiguity rejection, policy-basis binding, strict artifact validation, independent evidence-authenticity gates, approval-profile handling, constrained canonicalization, and expanded adversarial coverage.

Local gate: **20/20 tests passing**.
