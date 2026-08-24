import json, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'src'))
from transition_closure import verify_closure, digest_object, Status

B=json.loads(pathlib.Path(__file__).resolve().parents[1].joinpath('fixtures/example-bundle.json').read_text())
def cp(x): return json.loads(json.dumps(x))
def invoke(c=None,f=None,o=None):
    c=cp(B['authorization_context']) if c is None else c
    f=cp(B['trace_record_fragment']) if f is None else f
    o=cp(B['observed_transition']) if o is None else o
    return verify_closure(f,c,o,authorization_evidence_verified=True,observation_evidence_verified=True)

class ExternalFindingsRegression(unittest.TestCase):
    def test_boolean_timestamps_rejected(self):
        c=cp(B['authorization_context']); o=cp(B['observed_transition'])
        c['not_before']=False; c['expires_at']=True; o['executed_at']=True
        r=invoke(c,cp(B['trace_record_fragment']),o)
        self.assertEqual(Status.INDETERMINATE,r.closure_status)
        self.assertTrue(any(x in r.reasons for x in ('INVALID_CONTEXT_NOT_BEFORE','INVALID_CONTEXT_EXPIRES_AT')))
    def test_proven_mismatch_not_demoted_by_missing_policy(self):
        c=cp(B['authorization_context']); f=cp(B['trace_record_fragment']); del f['policy']; f['references'][0]['digest']='sha256:'+'f'*64
        r=invoke(c,f,cp(B['observed_transition']))
        self.assertEqual(Status.FAILED,r.closure_status); self.assertIn('AUTHORIZATION_CONTEXT_DIGEST_MISMATCH',r.reasons); self.assertIn('TRACE_POLICY_BINDING_UNAVAILABLE',r.reasons)
    def test_uppercase_hex_is_not_trace_conforming(self):
        c=cp(B['authorization_context']); f=cp(B['trace_record_fragment']); f['references'][0]['digest']=digest_object(c).upper().replace('SHA256','sha256')
        r=invoke(c,f,cp(B['observed_transition']))
        self.assertEqual(Status.INDETERMINATE,r.closure_status); self.assertIn('AUTHORIZED_INTENT_REFERENCE_DIGEST_UNSUPPORTED_OR_INVALID',r.reasons)
    def test_sha384_reference_supported(self):
        c=cp(B['authorization_context']); f=cp(B['trace_record_fragment']); f['references'][0]['digest']=digest_object(c,'sha384')
        self.assertEqual(Status.VERIFIED,invoke(c,f,cp(B['observed_transition'])).closure_status)
    def test_malformed_references_named(self):
        f=cp(B['trace_record_fragment']); f['references']={'rel':'authorized-intent'}
        r=invoke(cp(B['authorization_context']),f,cp(B['observed_transition']))
        self.assertEqual((Status.INDETERMINATE,('MALFORMED_REFERENCES',)),(r.closure_status,r.reasons))
    def test_large_integer_not_canonicalizable(self):
        c=cp(B['authorization_context']); c['not_before']=2**53
        with self.assertRaises(TypeError): digest_object(c)
    def test_expiry_is_exclusive(self):
        c=cp(B['authorization_context']); o=cp(B['observed_transition']); o['executed_at']=c['expires_at']
        r=invoke(c,cp(B['trace_record_fragment']),o)
        self.assertEqual(Status.FAILED,r.closure_status); self.assertIn('AUTHORIZATION_EXPIRED',r.reasons)
    def test_zero_width_window_rejected(self):
        c=cp(B['authorization_context']); c['expires_at']=c['not_before']; f=cp(B['trace_record_fragment']); f['references'][0]['digest']=digest_object(c)
        r=invoke(c,f,cp(B['observed_transition']))
        self.assertEqual(Status.INDETERMINATE,r.closure_status); self.assertIn('INVALID_CONTEXT_VALIDITY_WINDOW',r.reasons)
    def test_result_to_dict(self):
        d=invoke().to_dict(); self.assertEqual('VERIFIED',d['closure_status']); self.assertIsInstance(d['reasons'],list)
    def test_digest_bool_rejected(self):
        c=cp(B['authorization_context']); c['metadata']={'flag':True}
        with self.assertRaises(TypeError): digest_object(c)
    def test_non_string_key_rejected(self):
        c=cp(B['authorization_context']); c['metadata']={1:'x'}
        with self.assertRaises(TypeError): digest_object(c)
    def test_unsupported_digest_algorithm_rejected(self):
        with self.assertRaises(ValueError): digest_object(cp(B['authorization_context']),'sha512')
    def test_empty_allowed_effects_indeterminate(self):
        c=cp(B['authorization_context']); c['allowed_effects']=[]
        self.assertIn('INVALID_CONTEXT_ALLOWED_EFFECTS',invoke(c,cp(B['trace_record_fragment']),cp(B['observed_transition'])).reasons)
    def test_invalid_observation_resource_list(self):
        o=cp(B['observed_transition']); o['touched_resources']=[]
        self.assertIn('INVALID_OBSERVATION_TOUCHED_RESOURCES',invoke(cp(B['authorization_context']),cp(B['trace_record_fragment']),o).reasons)
    def test_invalid_observation_effect_list(self):
        o=cp(B['observed_transition']); o['observed_effects']=[]
        self.assertIn('INVALID_OBSERVATION_OBSERVED_EFFECTS',invoke(cp(B['authorization_context']),cp(B['trace_record_fragment']),o).reasons)
    def test_invalid_observation_time(self):
        o=cp(B['observed_transition']); o['executed_at']=True
        self.assertIn('INVALID_OBSERVATION_EXECUTED_AT',invoke(cp(B['authorization_context']),cp(B['trace_record_fragment']),o).reasons)

if __name__=='__main__': unittest.main()
