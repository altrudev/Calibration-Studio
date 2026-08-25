from __future__ import annotations
from two_axis import ProvenanceInput,ReceiptInput,VerificationResult,Overall,evaluate_provenance,evaluate_receipts,compose_overall

def _base(p,r):
    depth,pr,prs=evaluate_provenance(p); rr,rrs=evaluate_receipts(r); reasons=prs+rrs
    return depth,pr,rr,prs,rrs,tuple(p.evidence_anchors),tuple(r.evidence_anchors),reasons

def _result(depth,pr,rr,prs,rrs,pa,ra,reasons,overall=None):
    return VerificationResult(depth,pr,rr,prs,rrs,pa,ra,overall or compose_overall(pr,rr,reasons),reasons)

def receipt_success_upgrades_provenance(p,r):
    depth,pr,rr,prs,rrs,pa,ra,reasons=_base(p,r)
    if rr in {"verified","verified_negative_outcome"}: depth,pr="transitive","verified"
    return _result(depth,pr,rr,prs,rrs,pa,ra,reasons)

def provenance_manufactures_receipt_success(p,r):
    depth,pr,rr,prs,rrs,pa,ra,reasons=_base(p,r)
    if depth is not None: rr="verified"
    return _result(depth,pr,rr,prs,rrs,pa,ra,reasons)

def shared_success_boolean_reconstructs_both(p,r):
    depth,pr,rr,prs,rrs,pa,ra,reasons=_base(p,r); overall=compose_overall(pr,rr,reasons)
    if overall==Overall.AFFIRMING:
        depth=depth or "surface"; pr,rr="verified","verified"
    return _result(depth,pr,rr,prs,rrs,pa,ra,reasons,overall)

def provenance_downgrade_erases_receipts(p,r):
    depth,pr,rr,prs,rrs,pa,ra,reasons=_base(p,r)
    if pr in {"unresolved","floor_not_met"}:
        rr="unverified_required"; rrs=("ACTION_RECEIPT_REWRITTEN_BY_PROVENANCE",); ra=("evidence:provenance",)
    return _result(depth,pr,rr,prs,rrs,pa,ra,prs+rrs)

def receipt_failure_erases_provenance(p,r):
    depth,pr,rr,prs,rrs,pa,ra,reasons=_base(p,r)
    if rr in {"invalid","missing_required","unverified_required"}:
        depth,pr=None,"unresolved"; prs=("PROVENANCE_REWRITTEN_BY_RECEIPT",); pa=("evidence:action-receipts",)
    return _result(depth,pr,rr,prs,rrs,pa,ra,prs+rrs)

def receipt_success_launders_contradiction(p,r):
    depth,pr,rr,prs,rrs,pa,ra,reasons=_base(p,r); overall=compose_overall(pr,rr,reasons)
    if pr=="contradicted" and rr in {"verified","verified_negative_outcome"}:
        pr,prs,pa,reasons,overall="verified",(),(),rrs,Overall.AFFIRMING
    return _result(depth,pr,rr,prs,rrs,pa,ra,reasons,overall)

BROKEN_VERIFIERS={
 "receipt_success_upgrades_provenance":receipt_success_upgrades_provenance,
 "provenance_manufactures_receipt_success":provenance_manufactures_receipt_success,
 "shared_success_boolean_reconstructs_both":shared_success_boolean_reconstructs_both,
 "provenance_downgrade_erases_receipts":provenance_downgrade_erases_receipts,
 "receipt_failure_erases_provenance":receipt_failure_erases_provenance,
 "receipt_success_launders_contradiction":receipt_success_launders_contradiction,
}
