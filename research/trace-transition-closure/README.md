# TRACE Authorization-to-Transition Closure Prototype

**Status:** experimental / informative; not a TRACE normative change.

This prototype tests the transition-closure gap discussed around `agentrust-io/trace-spec#191`, composed with TRACE's assurance-neutral `references` mechanism from #197.

TRACE can attest a runtime record and point to external `authorized-intent` / `approval-outcome` facts. This prototype asks a separate question:

> Did execution occur against the same authorization context the decision-maker evaluated, and did the resulting transition stay inside the granted policy, resource, effect, time, and predecessor envelope?

## Core boundary

- TRACE attestation validity is independent.
- External evidence authenticity is independent.
- Authorization-to-transition closure is `VERIFIED`, `FAILED`, or `INDETERMINATE`.
- A closure result is never a substitute for TRACE signature/attestation verification.

A relying consumer should require all three:

`valid TRACE attestation covering references AND closure VERIFIED AND external evidence verified`

## Candidate composition

```text
AuthorizationContext/0.3
  decision_id
  action_digest
  predecessor_digest
  policy_digest
  resource/effect envelope
  validity window
        |
        | digest-bound authorized-intent reference
        v
TRACE Trust Record ----------------> independent TRACE attestation
        |
        +---- approval-outcome reference (optional profile)
        |
        v
ObservedTransition/0.3
        |
        v
Closure verifier
  VERIFIED | FAILED | INDETERMINATE
```

## Run

```bash
python -m pytest research/trace-transition-closure/tests/ -q
```

The implementation uses only the Python standard library.

## External review lineage

After v0.2, GitHub contributor `lywinged` independently cloned and ran PR #7, reproduced the 20/20 gate, exercised the TRACE/PIC bridge, and identified missing test guards plus six additional implementation edge cases. Their original 12-test artifact is retained unchanged as `tests/test_missing_guards.py`; attribution and provenance are the PR #7 review thread.

A later independent run reproduced the expanded suite and found one mutation-equivalent float guard plus a setup friction point: a virtual environment inside the measured project root is normally symlink-heavy and therefore trips the sweep's symlink refusal. Those findings drove the v1.1 instrument hardening below.

## v0.3 external-review hardening

v0.3 incorporates the reproduced findings:

- boolean timestamps no longer pass as integers;
- authorization validity is half-open: `not_before <= executed_at < expires_at`;
- zero-width windows are rejected;
- a proven contradiction cannot be demoted to `INDETERMINATE` by later missing evidence;
- TRACE-compatible lowercase SHA-256 and SHA-384 reference digests are supported;
- malformed `references` are diagnosed separately from absent references;
- context integers are bounded to `2^53 - 1` for cross-language interoperability;
- the trust-composition rule is explicit: closure cannot be consumed independently of valid TRACE attestation covering `references`.

The redundant float-specific refusal guard was removed rather than making its error-message wording part of the security contract. Floats remain rejected by the generic unsupported-value path.

## DDC Guard Sweep v1.1

A green suite does not establish that each invariant-enforcing guard is actually defended by a test. `tools/ddc_guard_sweep.py` is a hardened refusal-guard mutation instrument.

Its current measurement unit is deliberately narrow and machine-recorded:

`direct-refusal-if: immediate body directly raises or directly returns a non-VERIFIED ClosureResult`

The tool also reports mutation classes it does **not** currently measure, including helper-call refusals, `match/case`, ternaries, boolean short-circuit policy, and `reasons.append`-only sites. A mutation count without this unit definition should not be treated as a reproducible measurement.

### v1.1 hardening

- one immutable project snapshot is created before baseline/mutant execution;
- the project tree is hashed before snapshotting, the snapshot is hashed, and the project is hashed again; all three must match;
- every mutant is derived from that exact snapshot, so all mutants share one predecessor tree;
- the canonical checkout is never edited;
- mutation targets use AST fingerprint + exact source span rather than positional enumeration;
- only the guard expression is replaced with `False`;
- refusal classification uses the immediate body only, avoiding outer-container/inner-guard double counting;
- symlinks and non-regular filesystem objects are rejected before hashing/copying;
- project file-count and byte-size limits bound snapshot growth;
- keep virtual environments and symlinked dependencies **outside `--project-root`**;
- `--json-out` must also be outside `--project-root`, so writing evidence cannot mutate the measured predecessor after the gate declares it unchanged;
- the child environment is an allow-list rather than inheriting the full parent environment;
- raw test output is not retained; SHA-256 output hashes are stored instead;
- every outcome is repeated; `SILENT`, `NONDETERMINISTIC`, `TIMEOUT`, and `ERROR` all fail the gate;
- timed-out POSIX process groups are killed;
- machine-readable evidence preserves baseline results, each mutant identity/outcome, snapshot hash, canonical tree hashes, resolved executable, and a hash of the test command.

The instrument is also tested by deliberate self-mutation of critical behavior, including environment scrubbing and timeout classification.

### Current DDC gate

The local post-build gate used an independently hashed immutable snapshot and was run twice. Both runs produced the same snapshot hash, the same direct-refusal unit count, and the same result: **20 direct refusal guards, 20 detected, 0 silent, gate PASS**.

The broader local hardening suite passed **62/62** tests before publication of v1.1. These 62 are the local hardening corpus used for this revision; the repository also retains the independently contributed test artifact separately.

## Security boundary

DDC Guard Sweep is **not an OS or network sandbox**. The caller-supplied test command still has the operating-system and network capabilities of the account/environment running it. Use an isolated execution environment for untrusted test code, use the narrowest practical `--project-root`, keep secrets out of the test process, and keep virtual environments outside the measured root.

## Scope boundary

This prototype does **not** modify TRACE wire format, treat resolved references as attested truth, invalidate TRACE because a reference cannot be resolved, or verify TRACE signatures itself. It remains a composition layer.
