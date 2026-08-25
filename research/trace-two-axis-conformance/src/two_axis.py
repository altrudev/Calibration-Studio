from __future__ import annotations
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any

DEPTH_ORDER = {"surface": 0, "builder": 1, "transitive": 2}

class Overall(str, Enum):
    AFFIRMING = "affirming"
    WARNING = "warning"
    CONTRAINDICATED = "contraindicated"

@dataclass(frozen=True)
class ProvenanceInput:
    required_floor: str
    verified_depth: str | None
    evidence_state: str  # pass | unresolved | contradicted

@dataclass(frozen=True)
class ReceiptInput:
    requirement: str  # none | optional | required
    evidence_state: str  # absent | verified | invalid | unverified | valid_negative

@dataclass(frozen=True)
class VerificationResult:
    provenance_depth_verified: str | None
    provenance_result: str
    action_receipts_result: str
    overall_appraisal: Overall
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["overall_appraisal"] = self.overall_appraisal.value
        out["reasons"] = list(self.reasons)
        return out

def evaluate_provenance(p: ProvenanceInput) -> tuple[str | None, str, tuple[str, ...]]:
    if p.required_floor not in DEPTH_ORDER:
        raise ValueError("unknown required provenance floor")
    if p.verified_depth is not None and p.verified_depth not in DEPTH_ORDER:
        raise ValueError("unknown verified provenance depth")

    if p.evidence_state == "contradicted":
        return p.verified_depth, "contradicted", ("PROVENANCE_EVIDENCE_CONTRADICTED",)

    if p.evidence_state == "unresolved":
        reasons: list[str] = []
        if p.verified_depth is None:
            reasons.append("PROVENANCE_UNRESOLVED")
        elif DEPTH_ORDER[p.verified_depth] < DEPTH_ORDER[p.required_floor]:
            reasons.append("PROVENANCE_FLOOR_NOT_MET")
        return p.verified_depth, "unresolved", tuple(reasons)

    if p.evidence_state != "pass":
        raise ValueError("unknown provenance evidence state")
    if p.verified_depth is None:
        raise ValueError("pass provenance requires verified_depth")
    if DEPTH_ORDER[p.verified_depth] < DEPTH_ORDER[p.required_floor]:
        return p.verified_depth, "floor_not_met", ("PROVENANCE_FLOOR_NOT_MET",)
    return p.verified_depth, "verified", ()

def evaluate_receipts(r: ReceiptInput) -> tuple[str, tuple[str, ...]]:
    if r.requirement not in {"none", "optional", "required"}:
        raise ValueError("unknown receipt requirement")
    if r.evidence_state not in {"absent", "verified", "invalid", "unverified", "valid_negative"}:
        raise ValueError("unknown receipt evidence state")

    if r.requirement == "none":
        return "not_required", ()
    if r.evidence_state == "verified":
        return "verified", ()
    if r.evidence_state == "valid_negative":
        return "verified_negative_outcome", ()
    if r.evidence_state == "invalid":
        return "invalid", ("ACTION_RECEIPT_INVALID",)
    if r.evidence_state == "unverified":
        if r.requirement == "required":
            return "unverified_required", ("ACTION_RECEIPT_REQUIRED_BUT_UNVERIFIED",)
        return "unverified_optional", ("ACTION_RECEIPT_UNVERIFIED",)
    if r.requirement == "required":
        return "missing_required", ("ACTION_RECEIPT_MISSING_REQUIRED",)
    return "absent_optional", ()

def compose_overall(
    provenance_result: str,
    action_receipts_result: str,
    reasons: tuple[str, ...],
) -> Overall:
    hard_failure = (
        provenance_result == "contradicted"
        or "PROVENANCE_FLOOR_NOT_MET" in reasons
        or action_receipts_result in {"invalid", "unverified_required", "missing_required"}
    )
    warning = (
        provenance_result == "unresolved"
        or action_receipts_result in {"unverified_optional", "absent_optional"}
    )
    if hard_failure:
        return Overall.CONTRAINDICATED
    if warning:
        return Overall.WARNING
    return Overall.AFFIRMING

def verify_axes(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, provenance_result, provenance_reasons = evaluate_provenance(p)
    receipt_result, receipt_reasons = evaluate_receipts(r)
    reasons = provenance_reasons + receipt_reasons
    return VerificationResult(
        provenance_depth_verified=depth,
        provenance_result=provenance_result,
        action_receipts_result=receipt_result,
        overall_appraisal=compose_overall(provenance_result, receipt_result, reasons),
        reasons=reasons,
    )
