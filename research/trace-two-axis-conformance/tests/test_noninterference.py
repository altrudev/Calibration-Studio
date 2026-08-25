import json, pathlib, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/"src"), str(ROOT/"tools")]
from two_axis import ProvenanceInput, ReceiptInput, verify_axes
from broken_verifiers import BROKEN_VERIFIERS

ORACLES = json.loads((ROOT/"fixtures/named-oracles.json").read_text())
PROVENANCE_STATES = [
    ProvenanceInput("surface","surface","pass"),
    ProvenanceInput("builder","builder","pass"),
    ProvenanceInput("transitive","transitive","pass"),
    ProvenanceInput("transitive","builder","unresolved"),
    ProvenanceInput("builder","builder","contradicted"),
]
RECEIPT_STATES = [
    ReceiptInput("none","absent"),
    ReceiptInput("optional","absent"),
    ReceiptInput("optional","unverified"),
    ReceiptInput("required","verified"),
    ReceiptInput("required","valid_negative"),
    ReceiptInput("required","invalid"),
    ReceiptInput("required","absent"),
    ReceiptInput("required","unverified"),
]

class ExactOracleTests(unittest.TestCase):
    def test_oracle_artifact_is_static_data_not_generated_at_test_time(self):
        raw = (ROOT/"fixtures/named-oracles.json").read_text()
        self.assertNotIn("verify_axes", raw)
        self.assertNotIn("python", raw.lower())

    def test_named_fixtures_match_exact_structured_oracles(self):
        for case in ORACLES:
            with self.subTest(case=case["id"]):
                got = verify_axes(
                    ProvenanceInput(**case["provenance"]),
                    ReceiptInput(**case["receipts"]),
                ).to_dict()
                self.assertEqual(case["expected"], got)

class CrossProductNonInterferenceTests(unittest.TestCase):
    def test_exactly_40_admissible_cross_product_states(self):
        self.assertEqual(40, len(PROVENANCE_STATES) * len(RECEIPT_STATES))

    def test_receipt_changes_do_not_rewrite_provenance_projection(self):
        for p in PROVENANCE_STATES:
            baseline = verify_axes(p, RECEIPT_STATES[0])
            expected = (baseline.provenance_depth_verified, baseline.provenance_result)
            for r in RECEIPT_STATES[1:]:
                with self.subTest(provenance=p, receipts=r):
                    got = verify_axes(p, r)
                    self.assertEqual(expected, (got.provenance_depth_verified, got.provenance_result))

    def test_provenance_changes_do_not_rewrite_receipt_projection(self):
        for r in RECEIPT_STATES:
            baseline = verify_axes(PROVENANCE_STATES[0], r)
            expected = baseline.action_receipts_result
            for p in PROVENANCE_STATES[1:]:
                with self.subTest(provenance=p, receipts=r):
                    self.assertEqual(expected, verify_axes(p, r).action_receipts_result)

    def test_overall_appraisal_is_allowed_to_compose_axes(self):
        p = ProvenanceInput("transitive","transitive","pass")
        ok = verify_axes(p, ReceiptInput("required","verified"))
        missing = verify_axes(p, ReceiptInput("required","absent"))
        self.assertNotEqual(ok.overall_appraisal, missing.overall_appraisal)
        self.assertEqual(ok.provenance_result, missing.provenance_result)

class ImplementationMutationTests(unittest.TestCase):
    def test_every_broken_verifier_is_killed_over_full_40_state_product(self):
        survivors = {}
        for name, broken in BROKEN_VERIFIERS.items():
            killed_by = []
            for p in PROVENANCE_STATES:
                for r in RECEIPT_STATES:
                    reference = verify_axes(p, r)
                    mutant = broken(p, r)
                    if mutant != reference:
                        killed_by.append((p, r))
            if not killed_by:
                survivors[name] = killed_by
        self.assertEqual({}, survivors)

    def test_each_broken_verifier_changes_an_evidence_projection_or_launders_contradiction(self):
        for name, broken in BROKEN_VERIFIERS.items():
            semantic_difference = False
            for p in PROVENANCE_STATES:
                for r in RECEIPT_STATES:
                    ref = verify_axes(p, r)
                    mut = broken(p, r)
                    if (
                        ref.provenance_depth_verified != mut.provenance_depth_verified
                        or ref.provenance_result != mut.provenance_result
                        or ref.action_receipts_result != mut.action_receipts_result
                        or (ref.provenance_result == "contradicted" and mut.overall_appraisal != ref.overall_appraisal)
                    ):
                        semantic_difference = True
                        break
                if semantic_difference:
                    break
            self.assertTrue(semantic_difference, name)

if __name__ == "__main__":
    unittest.main()
