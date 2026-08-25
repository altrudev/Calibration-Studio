# cA2A action-evidence decision-time binding

**Author:** Val Rukhaylo (`altrudev`)  
**Date:** 2026-08-25  
**Status:** External research note / conformance question. This is not a claim of a cA2A defect or accepted requirement.

## Question

After cA2A added signed delegation credential validity windows, offline verification gained an explicit `at_time` parameter. The verifier documentation says an auditor replaying recorded evidence should pass **the time the action was decided**, not the auditor's current time.

The current ACTION conformance helper, however, verifies delegation-linked action evidence without supplying `at_time`, and the local `_ActionEvidence` fixture carries:

- `trace_record_hash`;
- `credential_id`;
- `requested_capability`;
- `controller_decision`.

It does not carry a decision/evaluation time. `DelegationRecord` likewise has no timestamp field in its hashed body.

That leaves a narrow offline-verification question:

> How does a verifier establish the time basis at which a time-bounded delegation credential should be evaluated when replaying action evidence?

## Current source evidence

At cA2A `main` inspected on 2026-08-25:

1. `ca2a_verify.verify_delegation_chain(..., at_time=None)` documents that `None` means current time and that an auditor should pass the time the action was decided.
2. `docs/spec/delegation-chain.md` says offline audit should pass the decision time because a credential that has lapsed by audit time may still have been valid at decision time.
3. The ACTION conformance helper `_verify_action_evidence()` calls `verify_delegation_chain()` without `at_time`.
4. `ACTION-012` and `ACTION-013` therefore use a credential expired since 2001 and a credential not valid until 2100 so the current-clock classification remains unambiguous.
5. `_ActionEvidence` itself contains no decision-time field, and `DelegationRecord.body()` contains no decision timestamp.

The extreme timestamps make the existing two negative cases deterministic; they do not exercise the replay case where a credential **was valid at decision time but is expired at audit time**.

## Candidate conformance fixture

A useful additional fixture would isolate exactly that distinction:

```text
credential window: [T0, T2]
action decision:   T1, where T0 <= T1 <= T2
audit/replay:       T3, where T3 > T2
```

Expected questions to settle before assigning a normative result:

- If authenticated action evidence binds `T1`, should replay verify the delegation at `T1` and remain provenance-valid?
- If no authenticated decision time is present, should the verifier report that temporal validity is not established rather than silently substitute `T3`?
- Is the decision-time commitment expected to come from TRACE/action-receipt evidence, from cA2A `DelegationRecord`, or from another signed object?

A paired mutation case should change the bound decision time while leaving the credential and action otherwise unchanged; the verifier should detect the change if the time basis is meant to be authoritative.

## Why this is separate from credential validity

The credential validity-window feature answers:

> Was this credential valid at evaluation time `T`?

This note asks a different question:

> Which authenticated evidence establishes that `T` is the correct time for an offline replay of this action?

Keeping those claims separate avoids turning auditor wall-clock time into an implicit authority input.

## Boundary

This note does not propose accepting expired credentials. It does not weaken live authorization, which should continue to evaluate current time. It concerns only **offline replay of already-recorded action evidence** and the provenance of the evaluation-time input.

It also does not assume where cA2A should carry the time commitment. If TRACE/action-receipt evidence already provides an authenticated decision time suitable for this purpose, the smallest conformance change may simply be to bind and pass that value into `verify_delegation_chain(at_time=...)` and test substitution/missing-time behavior.

## References

- `agentrust-io/ca2a#36` — delegation-linked action evidence conformance
- `agentrust-io/ca2a#110` — credential validity windows
- `src/ca2a_verify/verify.py` — offline `at_time` verifier API
- `tests/conformance/test_profile_conformance.py` — ACTION fixture helper and ACTION-012/013
- `src/ca2a_runtime/provenance.py` — current `DelegationRecord` hashed body
