from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any

DIGEST_RE = re.compile(r"^sha256:[0-9A-Fa-f]{64}$")


class Status(str, Enum):
    VERIFIED = "VERIFIED"
    FAILED = "FAILED"
    INDETERMINATE = "INDETERMINATE"


@dataclass(frozen=True)
class ClosureResult:
    trace_attestation: str
    closure_status: Status
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["closure_status"] = self.closure_status.value
        out["reasons"] = list(self.reasons)
        return out


def _validate_canonical_value(obj: Any) -> None:
    if obj is None or isinstance(obj, (str, bool, int)):
        return
    if isinstance(obj, float):
        raise TypeError("AuthorizationContext/0.2 forbids floating-point values")
    if isinstance(obj, dict):
        for k, v in obj.items():
            if not isinstance(k, str):
                raise TypeError("object keys must be strings")
            if not k.isascii():
                raise TypeError("AuthorizationContext/0.2 requires ASCII object keys")
            _validate_canonical_value(v)
        return
    if isinstance(obj, (list, tuple)):
        for v in obj:
            _validate_canonical_value(v)
        return
    raise TypeError(f"unsupported canonical value: {type(obj).__name__}")


def canonical_bytes(obj: Any) -> bytes:
    """
    Deterministic encoding for AuthorizationContext/0.2 only.

    This is NOT TRACE Trust Record signature canonicalization. The prototype
    deliberately constrains its own artifact to integers/no floats and ASCII
    object keys so cross-language implementations do not accidentally treat
    Python's key ordering as RFC 8785.
    """
    _validate_canonical_value(obj)
    return json.dumps(
        obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def digest_object(obj: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_bytes(obj)).hexdigest()


def _references(trace_record: dict[str, Any], rel: str) -> list[dict[str, Any]]:
    refs = trace_record.get("references", [])
    if not isinstance(refs, list):
        return []
    return [r for r in refs if isinstance(r, dict) and r.get("rel") == rel]


def _valid_string_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) > 0 and all(isinstance(v, str) and v for v in value)


def _validate_context(ctx: dict[str, Any]) -> tuple[str, ...]:
    required_strings = (
        "decision_id", "action_digest", "predecessor_digest", "policy_digest"
    )
    missing = [f for f in required_strings if not isinstance(ctx.get(f), str) or not ctx.get(f)]
    if not _valid_string_list(ctx.get("allowed_resources")):
        missing.append("allowed_resources")
    if not _valid_string_list(ctx.get("allowed_effects")):
        missing.append("allowed_effects")
    if not isinstance(ctx.get("not_before"), int):
        missing.append("not_before")
    if not isinstance(ctx.get("expires_at"), int):
        missing.append("expires_at")
    if isinstance(ctx.get("not_before"), int) and isinstance(ctx.get("expires_at"), int):
        if ctx["expires_at"] < ctx["not_before"]:
            missing.append("validity_window")
    return tuple("INVALID_CONTEXT_" + x.upper() for x in missing)


def _validate_observation(obs: dict[str, Any]) -> tuple[str, ...]:
    required_strings = (
        "decision_id", "action_digest", "predecessor_digest", "successor_digest"
    )
    missing = [f for f in required_strings if not isinstance(obs.get(f), str) or not obs.get(f)]
    if not _valid_string_list(obs.get("touched_resources")):
        missing.append("touched_resources")
    if not _valid_string_list(obs.get("observed_effects")):
        missing.append("observed_effects")
    if not isinstance(obs.get("executed_at"), int):
        missing.append("executed_at")
    return tuple("INVALID_OBSERVATION_" + x.upper() for x in missing)


def verify_closure(
    trace_record: dict[str, Any],
    authorization_context: dict[str, Any] | None,
    observed_transition: dict[str, Any] | None,
    *,
    trace_attestation: str = "unknown",
    authorization_evidence_verified: bool = False,
    observation_evidence_verified: bool = False,
    require_approval_outcome: bool = False,
) -> ClosureResult:
    """
    Verify authorization-to-transition closure without redefining TRACE validity.

    VERIFIED is intentionally unavailable unless the caller independently
    verifies both the authorization artifact and observed-transition evidence.
    A TRACE reference is a signed pointer, not proof that its target is true.
    """
    intent_refs = _references(trace_record, "authorized-intent")
    if not intent_refs:
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("MISSING_AUTHORIZED_INTENT_REFERENCE",))
    if len(intent_refs) != 1:
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("AMBIGUOUS_AUTHORIZED_INTENT_REFERENCES",))
    ref = intent_refs[0]

    if require_approval_outcome:
        approvals = _references(trace_record, "approval-outcome")
        if not approvals:
            return ClosureResult(trace_attestation, Status.INDETERMINATE,
                                 ("MISSING_APPROVAL_OUTCOME_REFERENCE",))
        if len(approvals) != 1:
            return ClosureResult(trace_attestation, Status.INDETERMINATE,
                                 ("AMBIGUOUS_APPROVAL_OUTCOME_REFERENCES",))

    if authorization_context is None:
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("AUTHORIZED_INTENT_UNRESOLVED",))
    if authorization_context.get("type") != "AuthorizationContext/0.2":
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("UNSUPPORTED_AUTHORIZATION_CONTEXT_TYPE",))

    invalid_ctx = _validate_context(authorization_context)
    if invalid_ctx:
        return ClosureResult(trace_attestation, Status.INDETERMINATE, invalid_ctx)

    ref_digest = ref.get("digest")
    if not isinstance(ref_digest, str) or not DIGEST_RE.match(ref_digest):
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("AUTHORIZED_INTENT_REFERENCE_HAS_NO_VALID_DIGEST",))

    reasons: list[str] = []
    try:
        computed = digest_object(authorization_context)
    except (TypeError, ValueError):
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("AUTHORIZATION_CONTEXT_NOT_CANONICALIZABLE",))
    if ref_digest.lower() != computed.lower():
        reasons.append("AUTHORIZATION_CONTEXT_DIGEST_MISMATCH")
    if ref.get("id") != authorization_context.get("decision_id"):
        reasons.append("REFERENCE_DECISION_ID_MISMATCH")

    trace_policy = trace_record.get("policy")
    trace_policy_digest = trace_policy.get("bundle_hash") if isinstance(trace_policy, dict) else None
    if not isinstance(trace_policy_digest, str) or not trace_policy_digest:
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             tuple(reasons) + ("TRACE_POLICY_BINDING_UNAVAILABLE",))
    if trace_policy_digest != authorization_context["policy_digest"]:
        reasons.append("POLICY_BASIS_MISMATCH")

    if observed_transition is None:
        return ClosureResult(
            trace_attestation,
            Status.FAILED if reasons else Status.INDETERMINATE,
            tuple(reasons) if reasons else ("OBSERVED_TRANSITION_MISSING",),
        )
    if observed_transition.get("type") != "ObservedTransition/0.2":
        return ClosureResult(trace_attestation, Status.INDETERMINATE,
                             ("UNSUPPORTED_OBSERVED_TRANSITION_TYPE",))
    invalid_obs = _validate_observation(observed_transition)
    if invalid_obs:
        return ClosureResult(trace_attestation, Status.INDETERMINATE, invalid_obs)

    if observed_transition["decision_id"] != authorization_context["decision_id"]:
        reasons.append("DECISION_ID_MISMATCH")
    if observed_transition["action_digest"] != authorization_context["action_digest"]:
        reasons.append("ACTION_DIGEST_MISMATCH")
    if observed_transition["predecessor_digest"] != authorization_context["predecessor_digest"]:
        reasons.append("STALE_OR_DIFFERENT_PREDECESSOR")

    executed_at = observed_transition["executed_at"]
    if executed_at < authorization_context["not_before"]:
        reasons.append("EXECUTED_BEFORE_AUTHORIZATION_VALID")
    if executed_at > authorization_context["expires_at"]:
        reasons.append("AUTHORIZATION_EXPIRED")

    if not set(observed_transition["touched_resources"]).issubset(set(authorization_context["allowed_resources"])):
        reasons.append("RESOURCE_SCOPE_EXPANSION")
    if not set(observed_transition["observed_effects"]).issubset(set(authorization_context["allowed_effects"])):
        reasons.append("MUTATION_ENVELOPE_EXPANSION")

    expected_successor = authorization_context.get("expected_successor_digest")
    if expected_successor is not None and observed_transition["successor_digest"] != expected_successor:
        reasons.append("SUCCESSOR_DIGEST_MISMATCH")

    if reasons:
        return ClosureResult(trace_attestation, Status.FAILED, tuple(reasons))

    evidence_gaps = []
    if not authorization_evidence_verified:
        evidence_gaps.append("AUTHORIZATION_EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
    if not observation_evidence_verified:
        evidence_gaps.append("OBSERVATION_EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
    if evidence_gaps:
        return ClosureResult(trace_attestation, Status.INDETERMINATE, tuple(evidence_gaps))

    return ClosureResult(
        trace_attestation, Status.VERIFIED,
        ("TRANSITION_WITHIN_AUTHORIZED_ENVELOPE_GIVEN_VERIFIED_EVIDENCE",)
    )
