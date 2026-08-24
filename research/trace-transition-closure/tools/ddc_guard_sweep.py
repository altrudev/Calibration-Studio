#!/usr/bin/env python3
from __future__ import annotations
import argparse,ast,hashlib,json,os,shutil,signal,stat,subprocess,tempfile
from dataclasses import dataclass,asdict
from pathlib import Path
VERSION='1.1'
UNIT='direct-refusal-if: immediate body directly raises or directly returns a non-VERIFIED ClosureResult'
IGNORED={'.git','__pycache__','.pytest_cache'}
ENV_ALLOW={'PATH','HOME','USERPROFILE','TMPDIR','TEMP','TMP','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','LANG','LC_ALL'}

@dataclass(frozen=True)
class Guard: guard_id:str;lineno:int;col:int;end_lineno:int;end_col:int;expression:str;fingerprint:str
@dataclass(frozen=True)
class RunResult: kind:str;returncode:int|None;stdout_sha256:str;stderr_sha256:str
def sha(s):return hashlib.sha256(s.encode()).hexdigest()
def _verified(call):
    return any((isinstance(n,ast.Name) and n.id=='VERIFIED') or (isinstance(n,ast.Attribute) and n.attr=='VERIFIED') for n in ast.walk(call))
def _refusal_return(n):
    v=n.value
    if not isinstance(v,ast.Call):return False
    fn=v.func; ok=(isinstance(fn,ast.Name) and fn.id=='ClosureResult') or (isinstance(fn,ast.Attribute) and fn.attr=='ClosureResult')
    return ok and not _verified(v)
def discover_guards(source):
    out=[]
    for n in ast.walk(ast.parse(source)):
        if not isinstance(n,ast.If):continue
        if not any(isinstance(s,ast.Raise) or (isinstance(s,ast.Return) and _refusal_return(s)) for s in n.body):continue
        t=n.test;expr=ast.get_source_segment(source,t)
        mat=json.dumps({'test':ast.dump(t,include_attributes=False),'body':[ast.dump(s,include_attributes=False) for s in n.body],'span':[t.lineno,t.col_offset,t.end_lineno,t.end_col_offset]},sort_keys=True,separators=(',',':'))
        fp=hashlib.sha256(mat.encode()).hexdigest();out.append(Guard(fp[:16],t.lineno,t.col_offset,t.end_lineno,t.end_col_offset,expr,fp))
    return sorted(out,key=lambda g:(g.lineno,g.col,g.guard_id))
def _cc(line,b):return len(line.encode()[:b].decode())
def _off(lines,l,c):return sum(len(x) for x in lines[:l-1])+_cc(lines[l-1],c)
def mutate_guard(source,g):
    m=[x for x in discover_guards(source) if x.fingerprint==g.fingerprint]
    if len(m)!=1:raise RuntimeError(f'guard {g.guard_id}: expected exactly one fingerprint match, got {len(m)}')
    a=m[0];ls=source.splitlines(keepends=True);s=_off(ls,a.lineno,a.col);e=_off(ls,a.end_lineno,a.end_col)
    if source[s:e]!=a.expression:raise RuntimeError('source span mismatch')
    return source[:s]+'False'+source[e:]
def entries(project):
    for p in sorted(project.rglob('*')):
        rel=p.relative_to(project)
        if any(x in IGNORED for x in rel.parts):continue
        yield p,rel
def validate_tree(project,max_files=5000,max_bytes=50*1024*1024):
    fc=tb=0
    for p,rel in entries(project):
        if p.is_symlink():raise RuntimeError(f'symlink refused: {rel}. Keep virtual environments and symlinked dependencies outside --project-root.')
        mode=p.lstat().st_mode
        if stat.S_ISDIR(mode):continue
        if not stat.S_ISREG(mode):raise RuntimeError(f'non-regular filesystem entry refused: {rel}')
        fc+=1;tb+=p.stat().st_size
        if fc>max_files:raise RuntimeError('project file-count limit exceeded')
        if tb>max_bytes:raise RuntimeError('project byte-size limit exceeded')
    return fc,tb
def tree_digest(project):
    h=hashlib.sha256()
    for p,rel in entries(project):
        if p.is_file():
            d=p.read_bytes();h.update(str(rel).encode()+b'\0'+str(len(d)).encode()+b'\0'+hashlib.sha256(d).digest())
    return h.hexdigest()
def make_snapshot(project,max_files=5000,max_bytes=50*1024*1024):
    fc,tb=validate_tree(project,max_files,max_bytes)
    before=tree_digest(project)
    parent=Path(tempfile.mkdtemp(prefix='ddc-snap-'));snap=parent/'snapshot'
    shutil.copytree(project,snap,ignore=shutil.ignore_patterns('.git','__pycache__','.pytest_cache','*.pyc','*.pyo'))
    validate_tree(snap,max_files,max_bytes)
    snap_digest=tree_digest(snap)
    after=tree_digest(project)
    if not (before==snap_digest==after):
        shutil.rmtree(parent,ignore_errors=True)
        raise RuntimeError('project changed while immutable snapshot was being created')
    return snap,snap_digest,fc,tb
def clone_snapshot(snap):
    p=Path(tempfile.mkdtemp(prefix='ddc-run-'));t=p/'project';shutil.copytree(snap,t);return t
def scrubbed_env():
    e={k:v for k,v in os.environ.items() if k in ENV_ALLOW};e['PYTHONDONTWRITEBYTECODE']='1';e['PYTHONHASHSEED']='0';return e
def rr(kind,code,out,err):return RunResult(kind,code,sha(out),sha(err))
def execute(sandbox,cmd,timeout):
    kw={'cwd':sandbox,'env':scrubbed_env(),'text':True,'stdout':subprocess.PIPE,'stderr':subprocess.PIPE,'shell':False}
    if os.name!='nt':kw['start_new_session']=True
    try:
        p=subprocess.Popen(list(cmd),**kw)
        try:
            o,e=p.communicate(timeout=timeout);return rr('PASS' if p.returncode==0 else 'FAIL',p.returncode,o,e)
        except subprocess.TimeoutExpired:
            if os.name!='nt':
                try:os.killpg(p.pid,signal.SIGKILL)
                except ProcessLookupError:pass
            else:p.kill()
            o,e=p.communicate();return rr('TIMEOUT',None,o,e)
    except Exception as ex:return rr('ERROR',None,'',repr(ex))
def run(snap,cmd,timeout,rel=None,original=None,g=None):
    s=clone_snapshot(snap)
    try:
        if g is not None:(s/rel).write_text(mutate_guard(original,g))
        return execute(s,cmd,timeout)
    finally:shutil.rmtree(s.parent,ignore_errors=True)
def summarize(rs):
    k=[r.kind for r in rs]
    if len(set(k))!=1:return 'NONDETERMINISTIC'
    if k[0]=='PASS':return 'SILENT'
    if k[0]=='FAIL':return 'DETECTED'
    return k[0]
def main(argv=None):
    ap=argparse.ArgumentParser();ap.add_argument('--project-root',required=True);ap.add_argument('--source',required=True);ap.add_argument('--repeat',type=int,default=2);ap.add_argument('--timeout',type=float,default=30);ap.add_argument('--json-out');ap.add_argument('command',nargs=argparse.REMAINDER);ns=ap.parse_args(argv)
    cmd=list(ns.command);cmd=cmd[1:] if cmd and cmd[0]=='--' else cmd
    if not cmd:ap.error('test command required')
    project=Path(ns.project_root).resolve();rel=Path(ns.source)
    if rel.is_absolute() or '..' in rel.parts:ap.error('--source must be a safe relative path')
    validate_tree(project)
    before=tree_digest(project)
    if ns.json_out:
        jout=Path(ns.json_out).resolve()
        if jout==project or project in jout.parents:
            ap.error('--json-out must be outside --project-root so evidence writing cannot mutate the measured predecessor')
    snap=None
    try:
        snap,sd,fc,tb=make_snapshot(project);orig=(snap/rel).read_text();gs=discover_guards(orig)
        base=[run(snap,cmd,ns.timeout) for _ in range(ns.repeat)];bok=len({r.kind for r in base})==1 and base[0].kind=='PASS'
        rows=[]
        if bok:
            for g in gs:
                rs=[run(snap,cmd,ns.timeout,rel,orig,g) for _ in range(ns.repeat)]
                rows.append({**asdict(g),'outcome':summarize(rs),'runs':[asdict(r) for r in rs]})
        counts={}
        for x in rows:counts[x['outcome']]=counts.get(x['outcome'],0)+1
        after=tree_digest(project);bad=not bok or before!=after or any(k in counts for k in ('SILENT','NONDETERMINISTIC','TIMEOUT','ERROR'))
        env=scrubbed_env();exe=cmd[0]
        resolved_executable=str(Path(exe).resolve()) if Path(exe).is_absolute() else shutil.which(exe,path=env.get('PATH'))
        command_hash=hashlib.sha256(json.dumps(cmd,separators=(',',':')).encode()).hexdigest()
        report={'tool':'DDC Guard Sweep','version':VERSION,'unit':UNIT,'snapshot_sha256':sd,
          'canonical_tree_before':before,'canonical_tree_after':after,'canonical_tree_unchanged':before==after,
          'file_count':fc,'total_bytes':tb,'environment_allowlist':sorted(ENV_ALLOW),
          'resolved_executable':resolved_executable,'test_command_sha256':command_hash,
          'refusal_guards':len(gs),'baseline':[asdict(r) for r in base],'baseline_stable_green':bok,
          'mutants':rows,
          'uncovered_mutation_classes':['helper-call refusals','match/case guards','ternary guards','boolean short-circuit policy','reasons.append-only sites'],
          'counts':counts,'gate':'FAIL' if bad else 'PASS'}
        if ns.json_out:Path(ns.json_out).write_text(json.dumps(report,indent=2,sort_keys=True))
        print(json.dumps(report,indent=2,sort_keys=True));return 1 if bad else 0
    finally:
        if snap is not None:shutil.rmtree(snap.parent,ignore_errors=True)
if __name__=='__main__':raise SystemExit(main())
