#!/usr/bin/env python3
from __future__ import annotations
import argparse, ast, hashlib, json, os, shutil, signal, subprocess, sys, tempfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Sequence

VERSION = '1.0'
UNIT = 'if whose body raises, or directly returns a ClosureResult expression containing no VERIFIED symbol'

@dataclass(frozen=True)
class Guard:
    guard_id: str
    lineno: int
    col: int
    end_lineno: int
    end_col: int
    expression: str
    fingerprint: str

@dataclass(frozen=True)
class RunResult:
    kind: str
    returncode: int | None
    stdout_sha256: str
    stderr_sha256: str

def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def _closure_result_is_verified(call: ast.Call) -> bool:
    # VERIFIED must be an actual name/attribute in the ClosureResult expression,
    # not merely text inside a reason string.
    for n in ast.walk(call):
        if isinstance(n, ast.Name) and n.id == 'VERIFIED': return True
        if isinstance(n, ast.Attribute) and n.attr == 'VERIFIED': return True
    return False

def _return_refuses(node: ast.Return) -> bool:
    value=node.value
    if not isinstance(value, ast.Call): return False
    fn=value.func
    is_closure=(isinstance(fn,ast.Name) and fn.id=='ClosureResult') or (isinstance(fn,ast.Attribute) and fn.attr=='ClosureResult')
    return is_closure and not _closure_result_is_verified(value)

class _RefusalVisitor(ast.NodeVisitor):
    def __init__(self): self.refuses=False
    def visit_Raise(self,node): self.refuses=True
    def visit_Return(self,node):
        if _return_refuses(node): self.refuses=True
    # A nested executable scope is not part of the enclosing if's runtime body.
    def visit_FunctionDef(self,node): return
    def visit_AsyncFunctionDef(self,node): return
    def visit_Lambda(self,node): return
    def visit_ClassDef(self,node): return

def _body_refuses(body: list[ast.stmt]) -> bool:
    v=_RefusalVisitor()
    for stmt in body:
        v.visit(stmt)
        if v.refuses: return True
    return False

def discover_guards(source: str) -> list[Guard]:
    tree = ast.parse(source)
    found=[]
    for node in ast.walk(tree):
        if not isinstance(node, ast.If) or not _body_refuses(node.body):
            continue
        test=node.test
        needed=('lineno','col_offset','end_lineno','end_col_offset')
        if not all(hasattr(test,x) for x in needed):
            raise RuntimeError('Python AST lacks required source spans')
        expr=ast.get_source_segment(source,test)
        if expr is None:
            raise RuntimeError(f'cannot recover guard expression at line {test.lineno}')
        material=json.dumps({
            'test':ast.dump(test,include_attributes=False),
            'body':ast.dump(ast.Module(body=node.body,type_ignores=[]),include_attributes=False),
            'span':[test.lineno,test.col_offset,test.end_lineno,test.end_col_offset],
        },sort_keys=True,separators=(',',':'))
        fp=hashlib.sha256(material.encode()).hexdigest()
        found.append(Guard(fp[:16],test.lineno,test.col_offset,test.end_lineno,test.end_col_offset,expr,fp))
    return sorted(found,key=lambda g:(g.lineno,g.col,g.guard_id))

def _char_col(line: str, byte_col: int) -> int:
    raw=line.encode('utf-8')
    if byte_col < 0 or byte_col > len(raw): raise ValueError('AST byte column outside line')
    try: return len(raw[:byte_col].decode('utf-8'))
    except UnicodeDecodeError as e: raise ValueError('AST column is not a UTF-8 boundary') from e

def _offset(lines:list[str],lineno:int,col:int)->int:
    if lineno < 1 or lineno > len(lines): raise ValueError('source span line outside source')
    line=lines[lineno-1]
    return sum(len(x) for x in lines[:lineno-1])+_char_col(line,col)

def mutate_guard(source:str,guard:Guard)->str:
    matches=[g for g in discover_guards(source) if g.fingerprint==guard.fingerprint]
    if len(matches)!=1:
        raise RuntimeError(f'guard {guard.guard_id}: expected one fingerprint match, got {len(matches)}')
    actual=matches[0]
    if (actual.lineno,actual.col,actual.end_lineno,actual.end_col)!=(guard.lineno,guard.col,guard.end_lineno,guard.end_col):
        raise RuntimeError(f'guard {guard.guard_id}: span changed')
    lines=source.splitlines(keepends=True)
    start=_offset(lines,actual.lineno,actual.col)
    end=_offset(lines,actual.end_lineno,actual.end_col)
    if source[start:end]!=actual.expression:
        raise RuntimeError(f'guard {guard.guard_id}: text/span mismatch')
    return source[:start]+'False'+source[end:]

def _clean(project:Path)->None:
    for p in sorted(project.rglob('__pycache__'),reverse=True):
        if p.is_dir(): shutil.rmtree(p,ignore_errors=True)
    for p in project.rglob('.pytest_cache'):
        if p.is_dir(): shutil.rmtree(p,ignore_errors=True)

def _reject_symlinks(project: Path) -> None:
    for p in project.rglob('*'):
        if p.is_symlink():
            raise RuntimeError(f'symlink refused by default: {p.relative_to(project)}')

def _copy_project(project:Path)->Path:
    parent=Path(tempfile.mkdtemp(prefix='ddc-guard-sweep-'))
    target=parent/'project'
    shutil.copytree(project,target,ignore=shutil.ignore_patterns('.git','__pycache__','.pytest_cache','*.pyc','*.pyo'))
    return target

def _result(kind:str,returncode:int|None,out:str,err:str)->RunResult:
    # Output tails are intentionally omitted from evidence to reduce accidental
    # secret/data disclosure. Hashes still make runs comparable.
    return RunResult(kind,returncode,hashlib.sha256(out.encode()).hexdigest(),hashlib.sha256(err.encode()).hexdigest())

def _execute(sandbox:Path,command:Sequence[str],timeout:float)->RunResult:
    _clean(sandbox)
    env=dict(os.environ); env['PYTHONDONTWRITEBYTECODE']='1'; env['PYTHONHASHSEED']='0'
    try:
        kwargs={'cwd':sandbox,'env':env,'text':True,'stdout':subprocess.PIPE,'stderr':subprocess.PIPE,'shell':False}
        if os.name!='nt': kwargs['start_new_session']=True
        p=subprocess.Popen(list(command),**kwargs)
        try:
            out,err=p.communicate(timeout=timeout)
            return _result('PASS' if p.returncode==0 else 'FAIL',p.returncode,out,err)
        except subprocess.TimeoutExpired:
            if os.name!='nt':
                try: os.killpg(p.pid,signal.SIGKILL)
                except ProcessLookupError: pass
            else:
                p.kill()
            out,err=p.communicate()
            return _result('TIMEOUT',None,out,err)
    except Exception as e:
        return _result('ERROR',None,'',repr(e))

def run_once(project:Path,command:Sequence[str],timeout:float)->RunResult:
    sandbox=_copy_project(project)
    try: return _execute(sandbox,command,timeout)
    finally: shutil.rmtree(sandbox.parent,ignore_errors=True)

def run_mutant(project:Path,source_rel:Path,original:str,guard:Guard,command:Sequence[str],timeout:float)->RunResult:
    sandbox=_copy_project(project)
    try:
        (sandbox/source_rel).write_text(mutate_guard(original,guard),encoding='utf-8')
        return _execute(sandbox,command,timeout)
    finally:
        shutil.rmtree(sandbox.parent,ignore_errors=True)

def summarize(results:list[RunResult])->str:
    kinds=[r.kind for r in results]
    if len(set(kinds))!=1: return 'NONDETERMINISTIC'
    if kinds[0]=='PASS': return 'SILENT'
    if kinds[0]=='FAIL': return 'DETECTED'
    return kinds[0]

def main(argv:list[str]|None=None)->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--project-root',required=True)
    ap.add_argument('--source',required=True)
    ap.add_argument('--repeat',type=int,default=2)
    ap.add_argument('--timeout',type=float,default=30.0)
    ap.add_argument('--json-out')
    ap.add_argument('command',nargs=argparse.REMAINDER)
    ns=ap.parse_args(argv)
    cmd=list(ns.command)
    if cmd and cmd[0]=='--': cmd=cmd[1:]
    if not cmd: ap.error('test command required after --')
    if ns.repeat<2: ap.error('--repeat must be >= 2')
    if ns.timeout<=0: ap.error('--timeout must be > 0')
    project=Path(ns.project_root).resolve()
    _reject_symlinks(project)
    rel=Path(ns.source)
    if rel.is_absolute() or '..' in rel.parts: ap.error('--source must be a safe relative path')
    source_path=(project/rel).resolve()
    if project not in source_path.parents: ap.error('--source escapes project root')
    original=source_path.read_text(encoding='utf-8')
    before=sha256_text(original)
    guards=discover_guards(original)
    if not guards: raise SystemExit('no refusal guards found')
    baseline=[run_once(project,cmd,ns.timeout) for _ in range(ns.repeat)]
    bk=[r.kind for r in baseline]
    baseline_ok=len(set(bk))==1 and bk[0]=='PASS'
    entries=[]
    if baseline_ok:
        for g in guards:
            runs=[run_mutant(project,rel,original,g,cmd,ns.timeout) for _ in range(ns.repeat)]
            entries.append({**asdict(g),'outcome':summarize(runs),'runs':[asdict(r) for r in runs]})
    after=sha256_text(source_path.read_text(encoding='utf-8'))
    counts={}
    for e in entries: counts[e['outcome']]=counts.get(e['outcome'],0)+1
    unsafe=(not baseline_ok or before!=after or any(k in counts for k in ('SILENT','NONDETERMINISTIC','TIMEOUT','ERROR')))
    report={'tool':'DDC Guard Sweep','version':VERSION,'unit':UNIT,'python':sys.version.split()[0],
            'source':str(rel),'source_sha256_before':before,'source_sha256_after':after,'source_unchanged':before==after,
            'repeat':ns.repeat,'timeout_seconds':ns.timeout,'test_command':cmd,'baseline':[asdict(r) for r in baseline],
            'baseline_stable_green':baseline_ok,'refusal_guards':len(guards),'mutants':entries,'counts':counts,
            'gate':'FAIL' if unsafe else 'PASS'}
    if ns.json_out: Path(ns.json_out).write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(f'DDC Guard Sweep v{VERSION}')
    print(f'unit: {UNIT}')
    print(f'source sha256: {before}')
    print(f'baseline: {"stable green" if baseline_ok else bk}')
    print(f'refusal guards: {len(guards)}')
    for key in ('DETECTED','SILENT','NONDETERMINISTIC','TIMEOUT','ERROR'):
        if counts.get(key): print(f'{key.lower()}: {counts[key]}')
    print(f'canonical source unchanged: {before==after}')
    print(f'gate: {report["gate"]}')
    return 1 if unsafe else 0

if __name__=='__main__': raise SystemExit(main())
