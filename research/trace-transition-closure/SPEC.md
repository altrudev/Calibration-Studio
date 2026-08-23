# AuthorizationContext/0.1 — Informative Prototype

## Goal

Bind an authorization decision to the state and scope on which it depended, then independently check whether execution remained within that envelope.

## AuthorizationContext/0.1

Required fields:

- `type`: `AuthorizationContext/0.1`
- `decision_id`: stable authorization decision identifier
- `action_digest`: digest identifying the authorized action
- `predecessor_digest`: digest of the state/evidence snapshot evaluated for authorization
- `policy_digest`: digest of the policy basis used for the decision
- `allowed_resources`: finite set of resources the action may affect
- `allowed_effects`: finite set of effect classes the action may produce
- `not_before`: integer Unix time
- `expires_at`: integer Unix time

Optional:

- `expected_successor_digest`: if the authorizer approved an exact successor
- `metadata`: non-authoritative descriptive data

## TRACE binding

A TRACE Trust Record may carry an assurance-neutral reference:

```json
{
  "rel": "authorized-intent",
  "id": "decision-123",
  "resolver": "https://authority.example",
  "digest": "sha256:<AuthorizationContext digest>"
}
```

The TRACE record attests that it points to this reference. It does not attest the truth of the referenced object.

For this closure profile, a digest is required to produce `VERIFIED`. If the reference is resolvable but lacks a digest, closure is `INDETERMINATE`, not `FAILED`.

## ObservedTransition/0.1

Required:

- `type`: `ObservedTransition/0.1`
- `decision_id`
- `action_digest`
- `predecessor_digest`
- `successor_digest`
- `touched_resources`
- `observed_effects`
- `executed_at`

## Closure results

`VERIFIED`
: The reference digest matches the supplied authorization context; decision, action and predecessor match; execution occurred inside the validity window; touched resources and effects are subsets of the authorized envelope; and an exact successor matches when one was declared.

`FAILED`
: Evidence is present and establishes a contradiction: digest mismatch, stale predecessor, action mismatch, expired/not-yet-valid execution, scope expansion, effect expansion, decision mismatch, or exact-successor mismatch.

`INDETERMINATE`
: Evidence required to make a closure claim is absent or unresolved. This must not be coerced into either authorization success or failure.

## DDC-derived invariant

Authority is bound to the decision basis that existed when it was granted. Repetition, nominal action identity, model confidence, or successful execution does not silently create authority for a changed predecessor or expanded transition.
