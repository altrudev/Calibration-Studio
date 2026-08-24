import importlib.util, json, pathlib, subprocess, sys, tempfile, textwrap, unittest
TOOL=pathlib.Path(__file__).resolve().parents[1]/'tools'/'ddc_guard_sweep.py'
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
    def test_integration_finds_silent_guard_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'tests').mkdir()
            src=p/'src'/'mod.py'; src.write_text(SOURCE)
            (p/'tests'/'test_mod.py').write_text(textwrap.dedent('''
                import pathlib,sys,unittest
                sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/"src"))
                from mod import check, Status
                class T(unittest.TestCase):
                    def test_negative_refused(self): self.assertEqual(Status.FAILED,check(-1).status)
                    def test_normal_verified(self): self.assertEqual(Status.VERIFIED,check(1).status)
                if __name__ == '__main__': unittest.main()
            '''))
            before=src.read_text(); report=p/'report.json'
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--repeat','2','--timeout','10','--json-out',str(report),'--',sys.executable,'-B','-m','unittest','discover','-s','tests','-q'],text=True,capture_output=True)
            self.assertEqual(1,cp.returncode)
            data=json.loads(report.read_text())
            self.assertEqual(1,data['counts'].get('DETECTED'))
            self.assertEqual(1,data['counts'].get('SILENT'))
            self.assertEqual(before,src.read_text()); self.assertTrue(data['source_unchanged'])
class HardeningTests(unittest.TestCase):
    def test_non_ascii_before_guard_mutates_correct_span(self):
        source='''def f(x):\n    label = "é"\n    if x < 0:\n        return ClosureResult(Status.FAILED)\n    return ClosureResult(Status.VERIFIED)\n'''
        g=sweep.discover_guards(source)[0]
        m=sweep.mutate_guard(source,g)
        self.assertIn('if False:',m)
        self.assertIn('label = "é"',m)

    def test_nested_function_raise_does_not_make_outer_if_a_refusal_guard(self):
        source='''def f(flag):\n    if flag:\n        def inner():\n            raise ValueError("x")\n    return ClosureResult(Status.VERIFIED)\n'''
        self.assertEqual([],sweep.discover_guards(source))

    def test_verified_word_in_string_does_not_turn_refusal_into_accept(self):
        source='''def f(x):\n    if x:\n        return ClosureResult(Status.FAILED, "not VERIFIED")\n    return ClosureResult(Status.VERIFIED)\n'''
        self.assertEqual(1,len(sweep.discover_guards(source)))

class GatePassTests(unittest.TestCase):
    def test_gate_passes_when_every_guard_is_enforced(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'tests').mkdir()
            src=p/'src'/'mod.py'; src.write_text(SOURCE)
            (p/'tests'/'test_mod.py').write_text(textwrap.dedent('''
                import pathlib,sys,unittest
                sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/"src"))
                from mod import check, Status
                class T(unittest.TestCase):
                    def test_negative(self): self.assertEqual(Status.FAILED,check(-1).status)
                    def test_99(self): self.assertEqual(Status.FAILED,check(99).status)
                    def test_normal(self): self.assertEqual(Status.VERIFIED,check(1).status)
                if __name__ == '__main__': unittest.main()
            '''))
            report=p/'report.json'
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--repeat','2','--timeout','10','--json-out',str(report),'--',sys.executable,'-B','-m','unittest','discover','-s','tests','-q'],text=True,capture_output=True)
            self.assertEqual(0,cp.returncode,cp.stdout+cp.stderr)
            data=json.loads(report.read_text())
            self.assertEqual('PASS',data['gate']); self.assertEqual(2,data['counts'].get('DETECTED'))
            self.assertNotIn('SILENT',data['counts'])

class BoundaryTests(unittest.TestCase):
    def test_source_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'src'/'mod.py').write_text(SOURCE)
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','../outside.py','--',sys.executable,'-c','print(1)'],text=True,capture_output=True)
            self.assertNotEqual(0,cp.returncode)
            self.assertIn('safe relative path',cp.stderr)

    def test_symlink_in_project_is_rejected(self):
        if not hasattr(pathlib.Path,'symlink_to'):
            self.skipTest('symlinks unavailable')
        with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as od:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'src'/'mod.py').write_text(SOURCE)
            outside=pathlib.Path(od)/'outside.txt'; outside.write_text('secret')
            try: (p/'external-link').symlink_to(outside)
            except OSError: self.skipTest('symlink creation not permitted')
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--',sys.executable,'-c','print(1)'],text=True,capture_output=True)
            self.assertNotEqual(0,cp.returncode)
            self.assertIn('symlink refused',cp.stderr)

    def test_timeout_is_not_credited_as_detection(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td); (p/'src').mkdir(); (p/'tests').mkdir()
            src=p/'src'/'mod.py'; src.write_text(SOURCE)
            (p/'tests'/'slow.py').write_text('import time; time.sleep(2)')
            report=p/'report.json'
            cp=subprocess.run([sys.executable,str(TOOL),'--project-root',str(p),'--source','src/mod.py','--repeat','2','--timeout','0.2','--json-out',str(report),'--',sys.executable,'tests/slow.py'],text=True,capture_output=True,timeout=10)
            self.assertNotEqual(0,cp.returncode)
            data=json.loads(report.read_text())
            self.assertFalse(data['baseline_stable_green'])
            self.assertEqual(['TIMEOUT','TIMEOUT'],[x['kind'] for x in data['baseline']])
            self.assertEqual('FAIL',data['gate']); self.assertTrue(data['source_unchanged'])
