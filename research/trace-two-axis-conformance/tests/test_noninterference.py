import json,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/"src"),str(ROOT/"tools")]
from two_axis import *
from broken_verifiers import BROKEN_VERIFIERS

ORACLES=json.loads((ROOT/"fixtures/named-oracles.json").read_text())
PS=[
 ProvenanceInput("surface","surface","pass",("prov:surface",)),
 ProvenanceInput("builder","builder","pass",("prov:builder",)),
 ProvenanceInput("transitive","transitive","pass",("prov:transitive",)),
 ProvenanceInput("transitive","builder","unresolved",("prov:unresolved",)),
 ProvenanceInput("builder","builder","contradicted",("prov:contradicted",)),
 ProvenanceInput("surface",None,"unresolved",("prov:no-depth",)),
]
RS=[
 ReceiptInput("none","absent",("receipt:none",)),
 ReceiptInput("optional","absent",("receipt:optional-absent",)),
 ReceiptInput("optional","unverified",("receipt:optional-unverified",)),
 ReceiptInput("required","verified",("receipt:verified",)),
 ReceiptInput("required","valid_negative",("receipt:negative",)),
 ReceiptInput("required","invalid",("receipt:invalid",)),
 ReceiptInput("required","absent",("receipt:missing",)),
 ReceiptInput("required","unverified",("receipt:unverified",)),
]

def invariant_provenance_projection(verifier):
    for p in PS:
        base=provenance_projection(verifier(p,RS[0]))
        for r in RS[1:]:
            if provenance_projection(verifier(p,r)) != base:return False
    return True

def invariant_receipt_projection(verifier):
    for r in RS:
        base=receipt_projection(verifier(PS[0],r))
        for p in PS[1:]:
            if receipt_projection(verifier(p,r)) != base:return False
    return True

def invariant_contradiction_preserved(verifier):
    p=PS[4]
    for r in (RS[3],RS[4]):
        x=verifier(p,r)
        if x.provenance_result!="contradicted":return False
        if "PROVENANCE_EVIDENCE_CONTRADICTED" not in x.provenance_reasons:return False
        if x.provenance_anchors != p.evidence_anchors:return False
        if x.overall_appraisal != Overall.CONTRAINDICATED:return False
    return True

NAMED_INVARIANT_FOR_MUTANT={
 "receipt_success_upgrades_provenance":invariant_provenance_projection,
 "provenance_manufactures_receipt_success":invariant_receipt_projection,
 "shared_success_boolean_reconstructs_both":invariant_receipt_projection,
 "provenance_downgrade_erases_receipts":invariant_receipt_projection,
 "receipt_failure_erases_provenance":invariant_provenance_projection,
 "receipt_success_launders_contradiction":invariant_contradiction_preserved,
}

class ExactOracles(unittest.TestCase):
 def test_hand_authored_oracles(self):
  raw=(ROOT/"fixtures/named-oracles.json").read_text()
  self.assertNotIn("verify_axes",raw)
  for c in ORACLES:
   got=verify_axes(ProvenanceInput(**c["provenance"]),ReceiptInput(**c["receipts"])).to_dict()
   self.assertEqual(c["expected"],got)

class FullProduct(unittest.TestCase):
 def test_48_states(self):self.assertEqual(48,len(PS)*len(RS))
 def test_reference_provenance_projection_invariant(self):self.assertTrue(invariant_provenance_projection(verify_axes))
 def test_reference_receipt_projection_invariant(self):self.assertTrue(invariant_receipt_projection(verify_axes))
 def test_reference_contradiction_preserved(self):self.assertTrue(invariant_contradiction_preserved(verify_axes))
 def test_overall_may_compose(self):
  p=PS[2]; a=verify_axes(p,RS[3]); b=verify_axes(p,RS[6])
  self.assertNotEqual(a.overall_appraisal,b.overall_appraisal)
  self.assertEqual(provenance_projection(a),provenance_projection(b))

class CausalMutationGate(unittest.TestCase):
 def test_every_mutant_violates_its_named_invariant(self):
  self.assertEqual(set(BROKEN_VERIFIERS),set(NAMED_INVARIANT_FOR_MUTANT))
  survivors={}
  for name,mutant in BROKEN_VERIFIERS.items():
   invariant=NAMED_INVARIANT_FOR_MUTANT[name]
   if invariant(mutant):survivors[name]=invariant.__name__
  self.assertEqual({},survivors)

 def test_axis_scoped_reasons_and_anchors_are_part_of_projection(self):
  x=verify_axes(PS[4],RS[5])
  self.assertEqual(("PROVENANCE_EVIDENCE_CONTRADICTED",),x.provenance_reasons)
  self.assertEqual(("ACTION_RECEIPT_INVALID",),x.action_receipts_reasons)
  self.assertEqual(PS[4].evidence_anchors,x.provenance_anchors)
  self.assertEqual(RS[5].evidence_anchors,x.action_receipts_anchors)

if __name__=="__main__":unittest.main()
