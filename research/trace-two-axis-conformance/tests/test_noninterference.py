import json,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]; sys.path[:0]=[str(ROOT/"src"),str(ROOT/"tools")]
from two_axis import *
from coupling_mutants import MUTANTS
FIX=json.loads((ROOT/"fixtures/two-axis.json").read_text())
PS=[ProvenanceInput("surface","surface","pass"),ProvenanceInput("builder","builder","pass"),ProvenanceInput("transitive","transitive","pass"),ProvenanceInput("transitive","builder","unresolved"),ProvenanceInput("builder","builder","contradicted")]
RS=[ReceiptInput("none","absent"),ReceiptInput("optional","absent"),ReceiptInput("optional","unverified"),ReceiptInput("required","verified"),ReceiptInput("required","valid_negative"),ReceiptInput("required","invalid"),ReceiptInput("required","absent"),ReceiptInput("required","unverified")]
class T(unittest.TestCase):
 def test_receipts_cannot_rewrite_provenance(self):
  for p in PS:
   b=verify_axes(p,RS[0])
   for r in RS[1:]:
    g=verify_axes(p,r); self.assertEqual((b.provenance_depth_verified,b.provenance_result),(g.provenance_depth_verified,g.provenance_result))
 def test_provenance_cannot_rewrite_receipts(self):
  for r in RS:
   b=verify_axes(PS[0],r)
   for p in PS[1:]: self.assertEqual(b.action_receipts_result,verify_axes(p,r).action_receipts_result)
 def test_every_coupling_mutant_is_killed(self):
  survivors=[]
  for name,m in MUTANTS.items():
   if not any(m(verify_axes(ProvenanceInput(**p),ReceiptInput(**r))) != verify_axes(ProvenanceInput(**p),ReceiptInput(**r)) for _,p,r in FIX): survivors.append(name)
  self.assertEqual([],survivors)
 def test_control_negative_outcome_is_not_claimed_as_novel(self):
  _,p,r=next(x for x in FIX if x[0]=="CONTROL-NEGATIVE-OUTCOME")
  self.assertEqual("verified_negative_outcome",verify_axes(ProvenanceInput(**p),ReceiptInput(**r)).action_receipts_result)
