from dataclasses import replace
from two_axis import Overall

def m1(x): return replace(x,action_receipts_result="verified") if x.provenance_depth_verified else x
def m2(x): return replace(x,provenance_depth_verified="transitive") if x.action_receipts_result in {"verified","verified_negative_outcome"} else x
def m3(x): return replace(x,provenance_result="verified",action_receipts_result="verified") if x.overall_appraisal==Overall.AFFIRMING else x
def m4(x): return replace(x,action_receipts_result="unverified_required") if x.provenance_result=="unresolved" else x
def m5(x): return replace(x,provenance_depth_verified=None,provenance_result="unresolved") if x.action_receipts_result in {"invalid","missing_required","unverified_required"} else x
def m6(x): return replace(x,overall_appraisal=Overall.AFFIRMING,reasons=()) if x.action_receipts_result in {"verified","verified_negative_outcome"} else x

MUTANTS={
 "receipt_from_provenance":m1,
 "provenance_from_receipt":m2,
 "single_boolean":m3,
 "downgrade_erases_receipt":m4,
 "receipt_failure_erases_provenance":m5,
 "receipt_success_launders_contradiction":m6,
}
