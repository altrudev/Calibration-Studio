import importlib.util, json, os, pathlib, shutil, subprocess, sys, tempfile, textwrap, unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
TOOL=ROOT/'tools'/'ddc_guard_sweep.py'
spec=importlib.util.spec_from_file_location('sweep',TOOL)
sweep=importlib.util.module_from_spec(spec); sys.modules['sweep']=sweep; spec.loader.exec_module(sweep)

SOURCE='''from dataclasses import dataclass
class Status:
    VERIFIED="VERIFIED"; FAILED="FAILED"
@dataclass
class ClosureResult:
    status: str

def check(x):
    if x < 0:
        return ClosureResult(Status.FAILED)
    if x == 99:
        return ClosureResult(Status.FAILED)
    return ClosureResult(Status.VERIFIED)
'''

class SweepTests(unittest.TestCase):
    def test_discovers_stable_units(self):
        gs=sweep.discover_guards(SOURCE)
        self.assertEqual(2,len(gs)); self.assertNotEqual(gs[0].guard_id,gs[1].guard_id)

    def test_mutation_changes_only_condition(self):
        g=sweep.discover_guards(SOURCE)[0]; m=sweep.mutate_guard(SOURCE,g)
        self.assertIn('if False:',m)
        self.assertEqual(SOURCE.count('return ClosureResult'),m.count('return ClosureResult'))

    def test_direct_unit_does_not_count_outer_container(self):
        source='''def f(x):\n    if x:\n        if x > 1:\n            return ClosureResult(Status.FAILED)\n    return ClosureResult(Status.VERIFIED)\n'''
        gs=sweep.discover_guards(source)
        self.assertEqual(1,len(gs)); self.assertEqual('x > 1',gs[0].expression)

    def test_verified_word_in_string_does_not_turn_refusal_into_accept(self):
        source='''def f(x):\n    if x:\n        return ClosureResult(Status.FAILED, "not VERIFIED")\n    return ClosureResult(Status.VERIFIED)\n'''
        self.assertEqual(1,len(sweep.discover_guards(source)))

    def test_environment_scrubs_unlisted_secret(self):
        os.environ['DDC_TEST_SECRET']='secret'
        self.assertNotIn('DDC_TEST_SECRET',sweep.scrubbed_env())

    def test_snapshot_digest_is_stable(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'a.txt').write_text('x')
            snap,d,_,_=sweep.make_snapshot(p)
            try: self.assertEqual(d,sweep.tree_digest(snap))
            finally: shutil.rmtree(snap.parent,ignore_errors=True)

    def test_symlink_in_project_is_rejected_with_venv_hint(self):
        if os.name=='nt': self.skipTest('symlink semantics differ on Windows')
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'a').write_text('x')
            (p/'venv').symlink_to('/tmp',target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError,'virtual environments.*outside --project-root'):
                sweep.validate_tree(p)

    def test_non_regular_fifo_is_rejected(self):
        if not hasattr(os,'mkfifo'): self.skipTest('FIFO unavailable')
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); os.mkfifo(p/'pipe')
            with self.assertRaisesRegex(RuntimeError,'non-regular'): sweep.validate_tree(p)

    def test_json_output_inside_measured_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'src'/'mod.py').write_text(SOURCE)
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--json-out',str(p/'report.json'),'--',sys.executable,'-c','print(1)'],text=True,capture_output=True)
            self.assertNotEqual(0,cp.returncode); self.assertIn('outside --project-root',cp.stderr)

    def test_gate_passes_when_every_guard_is_enforced(self):
        with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as od:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'tests').mkdir(); (p/'src'/'mod.py').write_text(SOURCE)
            (p/'tests'/'test_mod.py').write_text(textwrap.dedent('''
                import pathlib,sys,unittest
                sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/"src"))
                from mod import check, Status
                class T(unittest.TestCase):
                    def test_negative(self): self.assertEqual(Status.FAILED,check(-1).status)
                    def test_99(self): self.assertEqual(Status.FAILED,check(99).status)
                    def test_normal(self): self.assertEqual(Status.VERIFIED,check(1).status)
            '''))
            report=pathlib.Path(od)/'report.json'
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--repeat','2','--timeout','10','--json-out',str(report),'--',sys.executable,'-B','-m','unittest','discover','-s','tests','-q'],text=True,capture_output=True)
            self.assertEqual(0,cp.returncode,cp.stdout+cp.stderr)
            data=json.loads(report.read_text())
            self.assertEqual('PASS',data['gate']); self.assertEqual({'DETECTED':2},data['counts'])
            self.assertTrue(data['canonical_tree_unchanged']); self.assertEqual(2,len(data['mutants']))

    def test_gate_fails_on_silent_guard(self):
        with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as od:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'tests').mkdir(); (p/'src'/'mod.py').write_text(SOURCE)
            (p/'tests'/'test_mod.py').write_text(textwrap.dedent('''
                import pathlib,sys,unittest
                sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/"src"))
                from mod import check, Status
                class T(unittest.TestCase):
                    def test_negative(self): self.assertEqual(Status.FAILED,check(-1).status)
                    def test_normal(self): self.assertEqual(Status.VERIFIED,check(1).status)
            '''))
            report=pathlib.Path(od)/'report.json'
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--repeat','2','--timeout','10','--json-out',str(report),'--',sys.executable,'-B','-m','unittest','discover','-s','tests','-q'],text=True,capture_output=True)
            self.assertNotEqual(0,cp.returncode)
            data=json.loads(report.read_text()); self.assertEqual(1,data['counts'].get('SILENT'))

    def test_self_mutation_environment_allowlist_is_detected(self):
        original=TOOL.read_text(); needle="e={k:v for k,v in os.environ.items() if k in ENV_ALLOW}"
        self.assertIn(needle,original); mutant=original.replace(needle,'e=dict(os.environ)',1)
        with tempfile.TemporaryDirectory() as td:
            q=pathlib.Path(td)/'mutant.py'; q.write_text(mutant)
            code=f"import importlib.util,os,sys;s=importlib.util.spec_from_file_location('m',r'{q}');m=importlib.util.module_from_spec(s);sys.modules['m']=m;s.loader.exec_module(m);os.environ['DDC_TEST_SECRET']='x';assert 'DDC_TEST_SECRET' not in m.scrubbed_env()"
            self.assertNotEqual(0,subprocess.run([sys.executable,'-c',code]).returncode)

    def test_self_mutation_timeout_semantics_is_detected(self):
        original=TOOL.read_text(); needle="return k[0]"
        self.assertIn(needle,original); mutant=original.replace(needle,"return 'DETECTED'",1)
        with tempfile.TemporaryDirectory() as td:
            q=pathlib.Path(td)/'mutant.py'; q.write_text(mutant)
            code=f"import importlib.util,sys;s=importlib.util.spec_from_file_location('m',r'{q}');m=importlib.util.module_from_spec(s);sys.modules['m']=m;s.loader.exec_module(m);r=m.RunResult('TIMEOUT',None,'a','b');assert m.summarize([r,r])=='TIMEOUT'"
            self.assertNotEqual(0,subprocess.run([sys.executable,'-c',code]).returncode)

    def test_measurement_unit_and_uncovered_classes_are_explicit(self):
        self.assertIn('direct-refusal-if',sweep.UNIT)
        source=TOOL.read_text()
        self.assertIn('uncovered_mutation_classes',source)

if __name__=='__main__': unittest.main()
