import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from transition_closure import Status, digest_object, verify_closure


def base_context():
    return {
        "type": "AuthorizationContext/0.1",
        "decision_id": "decision-123",
        "action_digest": "sha256:action",
        "predecessor_digest": "sha256:state-s0",
        "policy_digest": "sha256:policy-p1",
        "allowed_resources": ["account:operating", "vendor:42"],
        "allowed_effects": ["ledger-debit", "ledger-credit"],
        "not_before": 1_000,
        "expires_at": 2_000,
        "expected_successor_digest": "sha256:state-s1",
    }


def base_observation():
    return {
        "type": "ObservedTransition/0.1",
        "decision_id": "decision-123",
        "action_digest": "sha256:action",
        "predecessor_digest": "sha256:state-s0",
        "successor_digest": "sha256:state-s1",
        "touched_resources": ["account:operating", "vendor:42"],
        "observed_effects": ["ledger-debit", "ledger-credit"],
        "executed_at": 1_500,
    }


def trace_for(ctx, include_digest=True):
    ref = {
        "rel": "authorized-intent",
        "id": ctx["decision_id"],
        "resolver": "https://authority.example",
    }
    if include_digest:
        ref["digest"] = digest_object(ctx)
    return {
        "eat_profile": "tag:agentrust-io.com,2026:trace-v0.2",
        "references": [ref],
    }


class ClosureTests(unittest.TestCase):
    def test_exact_context_passes(self):
        ctx, obs = base_context(), base_observation()
        result = verify_closure(trace_for(ctx), ctx, obs, trace_attestation="valid")
        self.assertEqual(Status.VERIFIED, result.closure_status)
        self.assertEqual("valid", result.trace_attestation)

    def test_stale_predecessor_fails(self):
        ctx, obs = base_context(), base_observation()
        obs["predecessor_digest"] = "sha256:state-s0-prime"
        result = verify_closure(trace_for(ctx), ctx, obs)
        self.assertEqual(Status.FAILED, result.closure_status)
        self.assertIn("STALE_OR_DIFFERENT_PREDECESSOR", result.reasons)

    def test_same_action_scope_expansion_fails(self):
        ctx, obs = base_context(), base_observation()
        obs["touched_resources"].append("account:reserve")
        result = verify_closure(trace_for(ctx), ctx, obs)
        self.assertIn("RESOURCE_SCOPE_EXPANSION", result.reasons)

    def test_effect_expansion_fails(self):
        ctx, obs = base_context(), base_observation()
        obs["observed_effects"].append("delete-audit-log")
        result = verify_closure(trace_for(ctx), ctx, obs)
        self.assertIn("MUTATION_ENVELOPE_EXPANSION", result.reasons)

    def test_expired_authorization_fails(self):
        ctx, obs = base_context(), base_observation()
        obs["executed_at"] = 2_001
        result = verify_closure(trace_for(ctx), ctx, obs)
        self.assertIn("AUTHORIZATION_EXPIRED", result.reasons)

    def test_mutated_context_same_id_fails_digest(self):
        ctx = base_context()
        trace = trace_for(ctx)
        mutated = copy.deepcopy(ctx)
        mutated["allowed_resources"].append("account:reserve")
        result = verify_closure(trace, mutated, base_observation())
        self.assertIn("AUTHORIZATION_CONTEXT_DIGEST_MISMATCH", result.reasons)

    def test_missing_digest_is_indeterminate(self):
        ctx = base_context()
        result = verify_closure(trace_for(ctx, include_digest=False), ctx, base_observation())
        self.assertEqual(Status.INDETERMINATE, result.closure_status)

    def test_unresolved_reference_is_indeterminate_but_trace_can_stay_valid(self):
        ctx = base_context()
        result = verify_closure(
            trace_for(ctx), None, base_observation(), trace_attestation="valid"
        )
        self.assertEqual(Status.INDETERMINATE, result.closure_status)
        self.assertEqual("valid", result.trace_attestation)

    def test_execution_without_reference_is_indeterminate(self):
        result = verify_closure({}, base_context(), base_observation(), trace_attestation="valid")
        self.assertEqual(Status.INDETERMINATE, result.closure_status)
        self.assertIn("MISSING_AUTHORIZED_INTENT_REFERENCE", result.reasons)

    def test_exact_successor_mismatch_fails(self):
        ctx, obs = base_context(), base_observation()
        obs["successor_digest"] = "sha256:unexpected"
        result = verify_closure(trace_for(ctx), ctx, obs)
        self.assertIn("SUCCESSOR_DIGEST_MISMATCH", result.reasons)


if __name__ == "__main__":
    unittest.main()
