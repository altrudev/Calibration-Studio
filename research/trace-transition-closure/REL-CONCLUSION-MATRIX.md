# TRACE `references.rel` conclusion matrix — research preparation

Status: **informative research preparation only**  
Scope: TRACE `references` semantics relevant to trace-spec #191 / #226  
Upstream authority: none — this document does not propose or modify normative TRACE text

## Purpose

TRACE §3.1.2 already establishes the common mechanism: a `references` entry points to an external fact, the record signature covers the pointer, an unresolved reference does not invalidate the Trust Record, and resolving a reference does not make the referenced object TRACE-attested evidence.

The remaining assurance question is narrower:

> For each `rel`, what is the strongest conclusion a verifier may make from a successfully resolved and independently verified referenced object, and what conclusions must remain unproven?

This matrix is prepared so that, if trace-spec #226 opens an executable-fixture or verifier-semantics contribution lane, the discussion can start from falsifiable promotion boundaries rather than another schema proposal.

## Standing invariant

```text
reference authenticity / integrity
!= authorization validity
!= approval consumption
!= execution validity
!= logical-operation identity
!= transition validity
!= external-outcome identity
```

A lower-level fact may support the next conclusion only when the verifier has the additional evidence required for that transition.

## Currently registered relations

| `rel` | Referenced fact in current TRACE text | A successful independent resolution may support | It must not establish by itself | Independent evidence still required | Negative promotion vector |
|---|---|---|---|---|---|
| `authorized-intent` | Authorization decided before execution and held in another system | The referenced authorization object exists, matches the signed pointer/digest when present, and may establish the authorization facts its own verifier is competent to validate | That the authorization was consumed; that the action executed; that execution used the approved predecessor/context; that the successor is valid; that any external effect occurred | Trusted authorization verification; action/intent binding; predecessor/context binding where material; runtime/execution evidence; successor/transition evidence; outcome evidence where claimed | Keep the same resolved authorization object and valid reference, but execute the same nominal action against a materially different predecessor. A verifier must not promote authorization validity to transition validity |
| `approval-outcome` | Attributable human approval attached to a `step_up` or `defer` decision | A separately verified approval artifact may establish the approval outcome, approver attribution and bindings actually covered by that artifact | That the approval was consumed by the recorded execution; that execution occurred; that the approved context remained current; that the transition succeeded; that the external effect occurred | Independent approval-signature/key verification; decision/action/run/context joins as defined by the approval artifact; runtime consumption evidence; transition and outcome evidence | Reuse a valid approval artifact and digest while presenting execution evidence for a different decision/action/context. The approval must remain valid as an artifact but fail the claimed consumption/join |
| `behavior-trace` | Behavioral record of what the agent did, of which the Trust Record is environment evidence | The external behavioral record may be resolved and, under its own verification rules, support claims about the behavior it actually records | TRACE hardware/runtime attestation of the behavioral record; policy compliance; authorization; causal correctness; physical/business outcome | Independent behavioral-trace authenticity/integrity verification; TRACE runtime evidence where environment claims are needed; policy/authorization evidence; outcome evidence for external effects | Supply a valid behavioral trace whose events are internally authentic but whose environment/runtime claim differs from the TRACE record. Neither source may silently validate the other |

## Candidate relations named in #226

These names are **descriptive placeholders only**. #226 has not registered values or settled whether the registry is normative or informative.

| Candidate relationship | Potential resolved-object conclusion | Must remain unproven without additional evidence | High-value negative vector |
|---|---|---|---|
| per-action policy evaluation | A particular external policy engine evaluated a bound action/context and returned the recorded decision, if independently authenticated | That the evaluated policy was the policy actually enforced at execution; that the action executed; that the result was compliant | Valid policy-decision artifact for action A, runtime executes action B or executes A under a different policy/context |
| policy exception / rule violation | A separately authenticated system recorded the named exception or violation with the stated bindings | That an exception authorized execution; that remediation occurred; that downstream state became valid | Valid exception record exists, but no authority grants the exception permission to override the base rule |
| incident / escalation trigger | A separately authenticated incident/escalation event occurred in the referenced system with the stated bindings | That escalation was resolved; that approval was granted; that execution was stopped or remediated | Valid trigger plus no closure evidence; verifier must preserve unresolved state rather than infer denial, approval or remediation |
| predecessor / authorization-context binding | **Research hypothesis:** the existing `authorized-intent` relation may already be sufficient when the referenced authorization object itself commits to predecessor/context; no new `rel` is implied merely by adding predecessor binding | That execution remained inside that predecessor/context or that the observed successor is conformant | Valid predecessor-bound authorization plus execution against stale/different predecessor; authorization stays valid, transition closure fails |

## Proposed executable fixture shape if #226 opens the lane

For each registered or candidate relation, use the same minimal pattern:

1. **positive resolution** — pointer resolves, digest/binding agrees, external verifier accepts;
2. **unresolved target** — TRACE record remains valid and no external conclusion is promoted;
3. **resolved but independently invalid target** — reference resolution succeeds, referenced-fact verification fails;
4. **cross-binding mismatch** — authentic external object is valid for another action/decision/context;
5. **unsupported promotion** — lower-level fact is valid but a higher-level conclusion lacks evidence;
6. **contradiction preservation** — later missing evidence cannot demote an already-proven contradiction to merely unknown.

The expected verifier output should separate at least:

```text
REFERENCE_RESOLVED
REFERENCED_OBJECT_VERIFIED
BINDING_VERIFIED
HIGHER_LEVEL_CLAIM_UNPROVEN | FAILED | VERIFIED
```

The exact vocabulary is intentionally not proposed here; only the assurance separation is being prepared.

## DDC boundary for this document

This document deliberately does **not**:

- add a TRACE schema field;
- register a new `rel` value;
- claim that resolving a reference makes it attested evidence;
- define maintainer-owned normative semantics;
- collapse authorization, execution, transition, or outcome verification;
- treat this research branch as TRACE conformance.

It is a reviewer-preparation artifact for a future, explicitly opened contribution lane.
