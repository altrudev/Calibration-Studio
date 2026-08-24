import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from transition_closure import Status, digest_object, verify_closure


def base_context():
    return {
        "type": "AuthorizationContext/0.2",
        "decision_id": "decision-123",
        "action_digest": "sha256:" + "a" * 64,
        "predecessor_digest": "sha256:" + "b" * 64,
        "policy_digest": "sha256:" + "c" * 64,
        "allowed_resources": ["account:operating", "vendor:42"],
        "allowed_effects": ["ledger-debit", "ledger-credit"],
        "not_before": 1000,
        "expires_at": 2000,
        "expected_successor_digest": "sha256:" + "d" * 64,
    }


def base_observation():
    c = base_context()
    return {
        "type": "ObservedTransition/0.2",
        "decision_id": c["decision_id"],
        "action_digest": c["action_digest"],
        "predecessor_digest": c["predecessor_digest"],
        "successor_digest": c["expected_successor_digest"],
        "touched_resources": ["account:operating", "vendor:42"],
        "observed_effects": ["ledger-debit", "ledger-credit"],
        "executed_at": 1500,
    }


def trace_for(ctx, include_digest=True, duplicate=False, approval=False):
    ref = {
        "rel": "authorized-intent",
        "id": ctx["decision_id"],
        "resolver": "https://authority.example",
    }
    if include_digest:
        ref["digest"] = digest_object(ctx)
    refs = [ref]
    if duplicate:
        refs.append(copy.deepcopy(ref))
    if approval:
        refs.append({
            "rel": "approval-outcome",
            "id": "approval-1",
            "resolver": "https://authority.example",
            "digest": "sha256:" + "e" * 64,
        })
    return {
        "eat_profile": "tag:agentrust-io.com,2026:trace-v0.2",
        "policy": {"bundle_hash": ctx["policy_digest"]},
        "references": refs,
    }


def verified(trace, ctx, obs, **kw):
    return verify_closure(
        trace,
        ctx,
        obs,
        authorization_evidence_verified=True,
        observation_evidence_verified=True,
        **kw,
    )


class ClosureTests(unittest.TestCase):
    def test_exact_context_passes(self):
        c, o = base_context(), base_observation()
        r = verify_closure(
            trace_for(c), c, o,
            trace_attestation="valid",
            authorization_evidence_verified=True,
            observation_evidence_verified=True,
        )
        self.assertEqual(Status.VERIFIED, r.closure_status)

    def test_stale_predecessor_fails(self):
        c, o = base_context(), base_observation()
        o["predecessor_digest"] = "sha256:" + "f" * 64
        self.assertIn("STALE_OR_DIFFERENT_PREDECESSOR", verified(trace_for(c), c, o).reasons)

    def test_scope_expansion_fails(self):
        c, o = base_context(), base_observation()
        o["touched_resources"].append("account:reserve")
        self.assertIn("RESOURCE_SCOPE_EXPANSION", verified(trace_for(c), c, o).reasons)

    def test_effect_expansion_fails(self):
        c, o = base_context(), base_observation()
        o["observed_effects"].append("delete-audit-log")
        self.assertIn("MUTATION_ENVELOPE_EXPANSION", verified(trace_for(c), c, o).reasons)

    def test_expiry_fails(self):
        c, o = base_context(), base_observation()
        o["executed_at"] = 2001
        self.assertIn("AUTHORIZATION_EXPIRED", verified(trace_for(c), c, o).reasons)

    def test_context_tampering_fails_digest(self):
        c = base_context()
        t = trace_for(c)
        m = copy.deepcopy(c)
        m["allowed_resources"].append("account:reserve")
        self.assertIn("AUTHORIZATION_CONTEXT_DIGEST_MISMATCH", verified(t, m, base_observation()).reasons)

    def test_missing_digest_indeterminate(self):
        c = base_context()
        self.assertEqual(Status.INDETERMINATE, verified(trace_for(c, False), c, base_observation()).closure_status)

    def test_unresolved_reference_indeterminate_trace_independent(self):
        c = base_context()
        r = verify_closure(trace_for(c), None, base_observation(), trace_attestation="valid")
        self.assertEqual((Status.INDETERMINATE, "valid"), (r.closure_status, r.trace_attestation))

    def test_missing_reference_indeterminate(self):
        c = base_context()
        r = verified({"policy": {"bundle_hash": c["policy_digest"]}}, c, base_observation())
        self.assertIn("MISSING_AUTHORIZED_INTENT_REFERENCE", r.reasons)

    def test_successor_mismatch_fails(self):
        c, o = base_context(), base_observation()
        o["successor_digest"] = "sha256:" + "f" * 64
        self.assertIn("SUCCESSOR_DIGEST_MISMATCH", verified(trace_for(c), c, o).reasons)

    def test_duplicate_authorized_intent_is_ambiguous(self):
        c = base_context()
        r = verified(trace_for(c, duplicate=True), c, base_observation())
        self.assertEqual(Status.INDETERMINATE, r.closure_status)
        self.assertIn("AMBIGUOUS_AUTHORIZED_INTENT_REFERENCES", r.reasons)

    def test_missing_required_context_cannot_verify(self):
        c = base_context()
        c["allowed_resources"] = []
        r = verified(trace_for(c), c, base_observation())
        self.assertEqual(Status.INDETERMINATE, r.closure_status)

    def test_policy_basis_mismatch_fails(self):
        c = base_context()
        t = trace_for(c)
        t["policy"]["bundle_hash"] = "sha256:" + "f" * 64
        self.assertIn("POLICY_BASIS_MISMATCH", verified(t, c, base_observation()).reasons)

    def test_missing_trace_policy_is_indeterminate(self):
        c = base_context()
        t = trace_for(c)
        del t["policy"]
        r = verified(t, c, base_observation())
        self.assertEqual(Status.INDETERMINATE, r.closure_status)
        self.assertIn("TRACE_POLICY_BINDING_UNAVAILABLE", r.reasons)

    def test_unverified_observation_cannot_be_promoted_to_verified(self):
        c, o = base_context(), base_observation()
        r = verify_closure(trace_for(c), c, o, authorization_evidence_verified=True)
        self.assertEqual(Status.INDETERMINATE, r.closure_status)
        self.assertIn("OBSERVATION_EVIDENCE_NOT_INDEPENDENTLY_VERIFIED", r.reasons)

    def test_unverified_authorization_cannot_be_promoted_to_verified(self):
        c, o = base_context(), base_observation()
        r = verify_closure(trace_for(c), c, o, observation_evidence_verified=True)
        self.assertEqual(Status.INDETERMINATE, r.closure_status)

    def test_approval_required_missing_is_indeterminate(self):
        c = base_context()
        r = verified(trace_for(c), c, base_observation(), require_approval_outcome=True)
        self.assertIn("MISSING_APPROVAL_OUTCOME_REFERENCE", r.reasons)

    def test_approval_required_present_can_verify(self):
        c = base_context()
        r = verified(trace_for(c, approval=True), c, base_observation(), require_approval_outcome=True)
        self.assertEqual(Status.VERIFIED, r.closure_status)

    def test_non_ascii_nested_metadata_key_rejected(self):
        c = base_context()
        c["metadata"] = {"😀": "x"}
        with self.assertRaises(TypeError):
            digest_object(c)

    def test_float_rejected(self):
        c = base_context()
        c["metadata"] = {"score": 0.5}
        with self.assertRaises(TypeError):
            digest_object(c)


if __name__ == "__main__":
    unittest.main()
