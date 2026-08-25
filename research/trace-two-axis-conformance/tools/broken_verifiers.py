from __future__ import annotations
from two_axis import (
    ProvenanceInput, ReceiptInput, VerificationResult, Overall,
    evaluate_provenance, evaluate_receipts, compose_overall,
)

def _base_parts(p, r):
    depth, pr, prs = evaluate_provenance(p)
    rr, rrs = evaluate_receipts(r)
    return depth, pr, rr, prs + rrs

def receipt_success_upgrades_provenance(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, pr, rr, reasons = _base_parts(p, r)
    if rr in {"verified", "verified_negative_outcome"}:
        depth, pr = "transitive", "verified"
    return VerificationResult(depth, pr, rr, compose_overall(pr, rr, reasons), reasons)

def provenance_manufactures_receipt_success(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, pr, rr, reasons = _base_parts(p, r)
    if depth is not None:
        rr = "verified"
    return VerificationResult(depth, pr, rr, compose_overall(pr, rr, reasons), reasons)

def shared_success_boolean_reconstructs_both(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, pr, rr, reasons = _base_parts(p, r)
    overall = compose_overall(pr, rr, reasons)
    if overall == Overall.AFFIRMING:
        depth = depth or "surface"
        pr, rr = "verified", "verified"
    return VerificationResult(depth, pr, rr, overall, reasons)

def provenance_downgrade_erases_receipts(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, pr, rr, reasons = _base_parts(p, r)
    if pr in {"unresolved", "floor_not_met"}:
        rr = "unverified_required"
    return VerificationResult(depth, pr, rr, compose_overall(pr, rr, reasons), reasons)

def receipt_failure_erases_provenance(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, pr, rr, reasons = _base_parts(p, r)
    if rr in {"invalid", "missing_required", "unverified_required"}:
        depth, pr = None, "unresolved"
    return VerificationResult(depth, pr, rr, compose_overall(pr, rr, reasons), reasons)

def receipt_success_launders_contradiction(p: ProvenanceInput, r: ReceiptInput) -> VerificationResult:
    depth, pr, rr, reasons = _base_parts(p, r)
    overall = compose_overall(pr, rr, reasons)
    if pr == "contradicted" and rr in {"verified", "verified_negative_outcome"}:
        pr, reasons, overall = "verified", (), Overall.AFFIRMING
    return VerificationResult(depth, pr, rr, overall, reasons)

BROKEN_VERIFIERS = {
    "receipt_success_upgrades_provenance": receipt_success_upgrades_provenance,
    "provenance_manufactures_receipt_success": provenance_manufactures_receipt_success,
    "shared_success_boolean_reconstructs_both": shared_success_boolean_reconstructs_both,
    "provenance_downgrade_erases_receipts": provenance_downgrade_erases_receipts,
    "receipt_failure_erases_provenance": receipt_failure_erases_provenance,
    "receipt_success_launders_contradiction": receipt_success_launders_contradiction,
}
