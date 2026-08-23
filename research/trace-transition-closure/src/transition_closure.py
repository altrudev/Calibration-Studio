from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any


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


def canonical_bytes(obj: Any) -> bytes:
    """Deterministic encoding for AuthorizationContext/0.1 only.

    This is NOT TRACE Trust Record signature canonicalization. The prototype
    forbids floats and uses ASCII field names; JSON object keys are sorted and
    UTF-8 is used without whitespace.
    """
    _reject_floats(obj)
    return json.dumps(
        obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _reject_floats(obj: Any) -> None:
    if isinstance(obj, float):
        raise TypeError("AuthorizationContext/0.1 forbids floating-point values")
    if isinstance(obj, dict):
        for k, v in obj.items():
            if not isinstance(k, str):
                raise TypeError("object keys must be strings")
            _reject_floats(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _reject_floats(v)


def digest_object(obj: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_bytes(obj)).hexdigest()


def find_reference(trace_record: dict[str, Any], rel: str) -> dict[str, Any] | None:
    refs = trace_record.get("references", [])
    if not isinstance(refs, list):
        return None
    for ref in refs:
        if isinstance(ref, dict) and ref.get("rel") == rel:
            return ref
    return None


def verify_closure(
    trace_record: dict[str, Any],
    authorization_context: dict[str, Any] | None,
    observed_transition: dict[str, Any] | None,
    *,
    trace_attestation: str = "unknown",
) -> ClosureResult:
    """Verify authorization-to-transition closure without redefining TRACE validity."""
    reasons: list[str] = []

    ref = find_reference(trace_record, "authorized-intent")
    if ref is None:
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("MISSING_AUTHORIZED_INTENT_REFERENCE",),
        )

    if authorization_context is None:
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("AUTHORIZED_INTENT_UNRESOLVED",),
        )

    if authorization_context.get("type") != "AuthorizationContext/0.1":
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("UNSUPPORTED_AUTHORIZATION_CONTEXT_TYPE",),
        )

    ref_digest = ref.get("digest")
    if not ref_digest:
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("AUTHORIZED_INTENT_REFERENCE_HAS_NO_DIGEST",),
        )

    computed = digest_object(authorization_context)
    if ref_digest != computed:
        reasons.append("AUTHORIZATION_CONTEXT_DIGEST_MISMATCH")

    if ref.get("id") != authorization_context.get("decision_id"):
        reasons.append("REFERENCE_DECISION_ID_MISMATCH")

    if observed_transition is None:
        if reasons:
            return ClosureResult(trace_attestation, Status.FAILED, tuple(reasons))
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("OBSERVED_TRANSITION_MISSING",),
        )

    if observed_transition.get("type") != "ObservedTransition/0.1":
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("UNSUPPORTED_OBSERVED_TRANSITION_TYPE",),
        )

    if observed_transition.get("decision_id") != authorization_context.get("decision_id"):
        reasons.append("DECISION_ID_MISMATCH")

    if observed_transition.get("action_digest") != authorization_context.get("action_digest"):
        reasons.append("ACTION_DIGEST_MISMATCH")

    if observed_transition.get("predecessor_digest") != authorization_context.get("predecessor_digest"):
        reasons.append("STALE_OR_DIFFERENT_PREDECESSOR")

    executed_at = observed_transition.get("executed_at")
    not_before = authorization_context.get("not_before")
    expires_at = authorization_context.get("expires_at")
    if not all(isinstance(v, int) for v in (executed_at, not_before, expires_at)):
        return ClosureResult(
            trace_attestation,
            Status.INDETERMINATE,
            ("INVALID_OR_MISSING_TIME_BOUND",),
        )
    if executed_at < not_before:
        reasons.append("EXECUTED_BEFORE_AUTHORIZATION_VALID")
    if executed_at > expires_at:
        reasons.append("AUTHORIZATION_EXPIRED")

    allowed_resources = set(authorization_context.get("allowed_resources", []))
    touched_resources = set(observed_transition.get("touched_resources", []))
    if not touched_resources.issubset(allowed_resources):
        reasons.append("RESOURCE_SCOPE_EXPANSION")

    allowed_effects = set(authorization_context.get("allowed_effects", []))
    observed_effects = set(observed_transition.get("observed_effects", []))
    if not observed_effects.issubset(allowed_effects):
        reasons.append("MUTATION_ENVELOPE_EXPANSION")

    expected_successor = authorization_context.get("expected_successor_digest")
    if expected_successor is not None and observed_transition.get("successor_digest") != expected_successor:
        reasons.append("SUCCESSOR_DIGEST_MISMATCH")

    if reasons:
        return ClosureResult(trace_attestation, Status.FAILED, tuple(reasons))

    return ClosureResult(
        trace_attestation,
        Status.VERIFIED,
        ("TRANSITION_WITHIN_AUTHORIZED_ENVELOPE",),
    )
