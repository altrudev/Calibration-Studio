import json, sys, unittest, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from transition_closure import verify_closure, digest_object, Status

B = json.loads(pathlib.Path(__file__).resolve().parents[1].joinpath("fixtures/example-bundle.json").read_text())
def ctx(**kw):  c = json.loads(json.dumps(B["authorization_context"])); c.update(kw); return c
def frag(c, **kw):
    f = json.loads(json.dumps(B["trace_record_fragment"]))
    f["references"][0]["digest"] = digest_object(c); f.update(kw); return f
def obs(**kw): o = json.loads(json.dumps(B["observed_transition"])); o.update(kw); return o
def go(c=None, f=None, o="default", **kw):
    c = c or ctx(); f = f or frag(c)
    o = obs() if o == "default" else o
    return verify_closure(f, c, o, authorization_evidence_verified=True,
                          observation_evidence_verified=True, **kw)

class MissingGuards(unittest.TestCase):
    def test_decision_id_mismatch_fails(self):
        r = go(o=obs(decision_id="decision-999"))
        self.assertEqual(Status.FAILED, r.closure_status); self.assertIn("DECISION_ID_MISMATCH", r.reasons)
    def test_action_digest_mismatch_fails(self):
        r = go(o=obs(action_digest="sha256:" + "f"*64))
        self.assertEqual(Status.FAILED, r.closure_status); self.assertIn("ACTION_DIGEST_MISMATCH", r.reasons)
    def test_reference_id_binding_fails(self):
        c = ctx(); f = frag(c); f["references"][0]["id"] = "someone-elses-decision"
        r = go(c=c, f=f)
        self.assertEqual(Status.FAILED, r.closure_status); self.assertIn("REFERENCE_DECISION_ID_MISMATCH", r.reasons)
    def test_executed_before_window_fails(self):
        r = go(o=obs(executed_at=500))
        self.assertEqual(Status.FAILED, r.closure_status); self.assertIn("EXECUTED_BEFORE_AUTHORIZATION_VALID", r.reasons)
    def test_context_type_checked(self):
        r = go(c=ctx(type="AuthorizationContext/0.1"))
        self.assertEqual((Status.INDETERMINATE, ("UNSUPPORTED_AUTHORIZATION_CONTEXT_TYPE",)), (r.closure_status, r.reasons))
    def test_observation_type_checked(self):
        r = go(o=obs(type="ObservedTransition/0.1"))
        self.assertEqual((Status.INDETERMINATE, ("UNSUPPORTED_OBSERVED_TRANSITION_TYPE",)), (r.closure_status, r.reasons))
    def test_malformed_observation_indeterminate(self):
        o = obs(); del o["successor_digest"]
        r = go(o=o)
        self.assertEqual(Status.INDETERMINATE, r.closure_status)
        self.assertIn("INVALID_OBSERVATION_SUCCESSOR_DIGEST", r.reasons)
    def test_duplicate_approval_outcome_is_ambiguous(self):
        c = ctx(); f = frag(c)
        f["references"] += [{"rel":"approval-outcome","id":"ap-1","resolver":"r"},
                            {"rel":"approval-outcome","id":"ap-2","resolver":"r"}]
        r = go(c=c, f=f, require_approval_outcome=True)
        self.assertEqual((Status.INDETERMINATE, ("AMBIGUOUS_APPROVAL_OUTCOME_REFERENCES",)), (r.closure_status, r.reasons))
    def test_uncanonicalizable_context_reason_is_named(self):
        c = ctx(); c["extra"] = {"k": object.__new__(object)}
        c2 = ctx()
        r = verify_closure(frag(c2), c, obs(), authorization_evidence_verified=True,
                           observation_evidence_verified=True)
        self.assertEqual((Status.INDETERMINATE, ("AUTHORIZATION_CONTEXT_NOT_CANONICALIZABLE",)), (r.closure_status, r.reasons))
    def test_unresolved_context_names_its_reason(self):
        r = verify_closure(frag(ctx()), None, obs(), authorization_evidence_verified=True,
                           observation_evidence_verified=True)
        self.assertEqual((Status.INDETERMINATE, ("AUTHORIZED_INTENT_UNRESOLVED",)), (r.closure_status, r.reasons))
    def test_missing_observation_names_its_reason(self):
        r = verify_closure(frag(ctx()), ctx(), None, authorization_evidence_verified=True,
                           observation_evidence_verified=True)
        self.assertEqual((Status.INDETERMINATE, ("OBSERVED_TRANSITION_MISSING",)), (r.closure_status, r.reasons))
    def test_missing_observation_with_prior_mismatch_fails(self):
        c = ctx(); f = frag(c); f["references"][0]["id"] = "someone-elses-decision"
        r = verify_closure(f, c, None, authorization_evidence_verified=True,
                           observation_evidence_verified=True)
        self.assertEqual(Status.FAILED, r.closure_status)

if __name__ == "__main__":
    unittest.main()
