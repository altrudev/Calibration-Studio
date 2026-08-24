# Authorization-to-Transition Closure Prototype v0.2

Status: experimental / informative. This does not modify TRACE validity.

## DDC assurance boundary

TRACE attestation, external authorization truth, observed-transition truth, and transition closure are separate claims. A TRACE `reference` is a signed pointer, not proof that the referenced object is true. Therefore this verifier cannot return `VERIFIED` unless the caller has independently verified both the authorization artifact and the observed-transition evidence.

## AuthorizationContext/0.2

Required: `decision_id`, `action_digest`, `predecessor_digest`, `policy_digest`, non-empty `allowed_resources`, non-empty `allowed_effects`, `not_before`, and `expires_at`. Optional `expected_successor_digest` permits exact-successor checking.

The context digest binds the exact authorization basis. The TRACE record's `policy.bundle_hash` must equal `policy_digest`; otherwise closure fails. Multiple `authorized-intent` references are treated as ambiguous, never first-match-wins.

## Results

- `VERIFIED`: no contradiction and both external evidence classes were independently verified.
- `FAILED`: available evidence establishes a contradiction such as stale predecessor, policy mismatch, scope/effect expansion, digest tampering, expiry, action mismatch, or successor mismatch.
- `INDETERMINATE`: evidence or semantics required for a closure claim are missing, unresolved, ambiguous, unsupported, or not independently verified.

`trace_attestation` is reported separately and never rewritten by this layer.

## Canonicalization

AuthorizationContext/0.2 uses a deliberately constrained deterministic JSON encoding: no floats and ASCII object keys at every nesting level. This is not represented as RFC 8785 and is not TRACE signature canonicalization.

## Approval profile

When `require_approval_outcome=True`, exactly one TRACE `approval-outcome` reference must also exist. This prototype checks presence/ambiguity only; verification of the approval artifact itself remains external and must not be inferred from the pointer.

## DDC-derived invariant

Authority remains bound to the decision basis on which it was granted. A matching nominal action, successful execution, repeated execution, or a valid TRACE reference does not create authority for a changed predecessor, changed policy basis, expanded resource scope, expanded effect envelope, or unverified external evidence.
