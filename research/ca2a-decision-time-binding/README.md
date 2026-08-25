# cA2A action-evidence decision-time binding

**Author:** Val Rukhaylo (`altrudev`)  
**Date:** 2026-08-25  
**Status:** Independent research note only. **Not proposed upstream as a new finding.**

> **Provenance note:** I independently identified the decision-time replay question while reviewing cA2A `main`. Before proposing it upstream, I re-read the full current #36 discussion and found that GitHub contributor `ams-belal` had already raised substantially the same issue in `agentrust-io/ca2a#36` (comment `#issuecomment-5405988464`), including the idea of carrying an evidenced decision time into `verify_delegation_chain(at_time=...)` and adding a positive historical-replay fixture. This note is therefore retained only as a record of the independent analysis. I am not claiming novelty and will not submit a competing cA2A contribution on this scope.

## Question independently observed

After cA2A added signed delegation credential validity windows, offline verification gained an explicit `at_time` parameter. The verifier documentation says an auditor replaying recorded evidence should pass **the time the action was decided**, not the auditor's current time.

The current ACTION conformance helper verifies delegation-linked action evidence without supplying `at_time`, while the local `_ActionEvidence` fixture carries `trace_record_hash`, `credential_id`, `requested_capability`, and `controller_decision`, but no decision/evaluation time. `DelegationRecord` likewise has no timestamp field in its hashed body.

That produces the same narrow question already raised by `ams-belal`:

> How does an offline verifier establish the authenticated time basis at which a time-bounded delegation credential should be evaluated when replaying action evidence?

## Source evidence at the time of review

At cA2A `main` inspected on 2026-08-25:

1. `ca2a_verify.verify_delegation_chain(..., at_time=None)` documents that `None` means current time and that an auditor should pass the time the action was decided.
2. `docs/spec/delegation-chain.md` says offline audit should pass the decision time because a credential that has lapsed by audit time may still have been valid at decision time.
3. The ACTION conformance helper `_verify_action_evidence()` calls `verify_delegation_chain()` without `at_time`.
4. `ACTION-012` and `ACTION-013` use deliberately remote timestamps so current-clock classification remains unambiguous.
5. `_ActionEvidence` itself contains no decision-time field, and `DelegationRecord.body()` contains no decision timestamp.

## Boundary

This note does not propose accepting expired credentials, changing live authorization, or adding a second implementation of the already-proposed fixture. Its useful result is methodological: a contribution search must include the **current discussion history**, not just current code and the issue body, before novelty is claimed.

## References

- `agentrust-io/ca2a#36` — delegation-linked action evidence conformance
- `agentrust-io/ca2a#36#issuecomment-5405988464` — prior public proposal by `ams-belal`
- `agentrust-io/ca2a#110` — credential validity windows
- `src/ca2a_verify/verify.py` — offline `at_time` verifier API
- `tests/conformance/test_profile_conformance.py` — ACTION fixture helper and ACTION-012/013
- `src/ca2a_runtime/provenance.py` — current `DelegationRecord` hashed body
