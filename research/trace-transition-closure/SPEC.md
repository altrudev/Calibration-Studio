# Authorization-to-Transition Closure Prototype v0.3

Status: experimental / informative. This does not modify TRACE validity.

## Assurance boundary

TRACE attestation, external authorization truth, observed-transition truth, and transition closure are separate claims. A TRACE `reference` is a signed pointer, not proof that the referenced object is true. `VERIFIED` is unavailable unless the caller independently verifies both the authorization artifact and observed-transition evidence.

A consumer must compose the results rather than read closure alone:

`trusted transition = valid TRACE attestation covering references AND closure VERIFIED AND external evidence verified`

The `trace_attestation` parameter remains an externally supplied result in this prototype; this layer does not verify TRACE signatures itself.

## AuthorizationContext/0.3

Required: `decision_id`, `action_digest`, `predecessor_digest`, `policy_digest`, non-empty `allowed_resources`, non-empty `allowed_effects`, `not_before`, and `expires_at`. Optional `expected_successor_digest` enables exact-successor checking.

Time uses a half-open interval: `not_before <= executed_at < expires_at`. `expires_at` must be strictly greater than `not_before`. Booleans are not integers for this profile. Integers must be non-negative and at most `2^53 - 1` to stay within an interoperable JSON integer domain.

The TRACE record's `policy.bundle_hash` must equal `policy_digest`; otherwise closure fails. Multiple `authorized-intent` references are ambiguous and never resolved by ordering.

## Digest and canonicalization rules

Reference digests follow TRACE's lowercase digest syntax for `sha256` and `sha384`. The AuthorizationContext digest is computed with the algorithm named by the TRACE reference.

AuthorizationContext/0.3 uses constrained deterministic JSON: no floats, no booleans as values, integers limited to the interoperable safe range, and ASCII object keys at every nesting level. This is **not** represented as RFC 8785 and is not TRACE signature canonicalization.

## Results

- `VERIFIED`: no contradiction and both external evidence classes were independently verified.
- `FAILED`: available evidence establishes a contradiction, including stale predecessor, policy mismatch, digest tampering, scope/effect expansion, expiry, action mismatch, decision mismatch, or successor mismatch.
- `INDETERMINATE`: evidence or semantics required for closure are missing, unresolved, malformed, ambiguous, unsupported, or not independently verified.

Once a contradiction has been established, later missing evidence does not demote it to `INDETERMINATE`; both facts are retained in the reasons and the result remains `FAILED`.

## Approval profile

When `require_approval_outcome=True`, exactly one TRACE `approval-outcome` reference must exist. Verification of the approval artifact itself remains external and must not be inferred from the pointer.
