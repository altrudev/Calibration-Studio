from dataclasses import dataclass, asdict
from enum import Enum

DEPTH={"surface":0,"builder":1,"transitive":2}
class Overall(str,Enum):
    AFFIRMING="affirming"; WARNING="warning"; CONTRAINDICATED="contraindicated"

@dataclass(frozen=True)
class ProvenanceInput:
    required_floor:str; verified_depth:str|None; evidence_state:str

@dataclass(frozen=True)
class ReceiptInput:
    requirement:str; evidence_state:str

@dataclass(frozen=True)
class Result:
    provenance_depth_verified:str|None
    provenance_result:str
    action_receipts_result:str
    overall_appraisal:Overall
    reasons:tuple[str,...]
    def to_dict(self):
        d=asdict(self); d["overall_appraisal"]=self.overall_appraisal.value; d["reasons"]=list(self.reasons); return d

def provenance(p):
    if p.required_floor not in DEPTH or (p.verified_depth is not None and p.verified_depth not in DEPTH): raise ValueError("bad depth")
    if p.evidence_state=="contradicted": return p.verified_depth,"contradicted",["PROVENANCE_EVIDENCE_CONTRADICTED"]
    if p.evidence_state=="unresolved":
        rs=[]
        if p.verified_depth is None: rs.append("PROVENANCE_UNRESOLVED")
        elif DEPTH[p.verified_depth] < DEPTH[p.required_floor]: rs.append("PROVENANCE_FLOOR_NOT_MET")
        return p.verified_depth,"unresolved",rs
    if p.evidence_state!="pass" or p.verified_depth is None: raise ValueError("bad provenance state")
    if DEPTH[p.verified_depth] < DEPTH[p.required_floor]: return p.verified_depth,"floor_not_met",["PROVENANCE_FLOOR_NOT_MET"]
    return p.verified_depth,"verified",[]

def receipts(r):
    if r.requirement not in {"none","optional","required"}: raise ValueError("bad requirement")
    if r.evidence_state not in {"absent","verified","invalid","unverified","valid_negative"}: raise ValueError("bad receipt state")
    if r.requirement=="none": return "not_required",[]
    if r.evidence_state=="verified": return "verified",[]
    if r.evidence_state=="valid_negative": return "verified_negative_outcome",[]
    if r.evidence_state=="invalid": return "invalid",["ACTION_RECEIPT_INVALID"]
    if r.evidence_state=="unverified":
        return ("unverified_required",["ACTION_RECEIPT_REQUIRED_BUT_UNVERIFIED"]) if r.requirement=="required" else ("unverified_optional",["ACTION_RECEIPT_UNVERIFIED"])
    return ("missing_required",["ACTION_RECEIPT_MISSING_REQUIRED"]) if r.requirement=="required" else ("absent_optional",[])

def verify_axes(p,r):
    depth,pr,prs=provenance(p); rr,rrs=receipts(r); reasons=prs+rrs
    hard=pr=="contradicted" or "PROVENANCE_FLOOR_NOT_MET" in reasons or rr in {"invalid","unverified_required","missing_required"}
    warn=pr=="unresolved" or rr in {"unverified_optional","absent_optional"}
    overall=Overall.CONTRAINDICATED if hard else Overall.WARNING if warn else Overall.AFFIRMING
    return Result(depth,pr,rr,overall,tuple(reasons))
