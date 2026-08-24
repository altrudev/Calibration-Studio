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

After v0.2, GitHub contributor `lywinged` independently cloned and ran PR #7, reproduced the 20/20 gate, exercised the TRACE/PIC bridge, and identified missing test guards plus six additional implementation edge cases. Their original 12-test artifact is retained unchanged as `tests/test_missing_guards.py`; attribution and provenance are the PR #7 review thread, comment `#issuecomment-5394526168`.

The rebuilt mutation script they supplied is treated as a description of method, not as the original historical artifact, because the original container was reclaimed. We do not conflate those provenance classes.

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

Post-fix local gate: **48/48 passing**. The verifier module reaches **100% branch-inclusive coverage** under the combined suite.

## DDC Guard Sweep v1

The review also exposed a methodology gap: a green suite does not establish that each invariant-enforcing guard is actually defended by a test. `tools/ddc_guard_sweep.py` is our hardened implementation of refusal-guard mutation testing.

Its measurement unit is stated explicitly: an `if` whose body raises, or directly returns a `ClosureResult` expression containing no `VERIFIED` symbol. New mutation classes must use separately named units rather than silently changing the count.

Hardening properties:

- the canonical checkout is never edited;
- every baseline and mutant run uses a fresh temporary filesystem copy;
- targets are bound by AST fingerprint plus exact source span rather than positional enumeration;
- only the guard expression is replaced by `False`;
- UTF-8 AST byte offsets are converted safely before text replacement;
- nested functions/classes are not misclassified as part of an enclosing guard;
- Python bytecode and pytest caches are excluded/disabled;
- each outcome is repeated at least twice;
- timeout, error, nondeterminism, or a silent mutant all fail the gate;
- test subprocesses are run without a shell and timed-out POSIX process groups are killed;
- symlinks are refused by default so a project snapshot cannot silently expand outside its declared root;
- the original source SHA-256 is checked before and after the sweep;
- machine-readable evidence stores result/output hashes rather than potentially sensitive test logs.

This is **not an OS security sandbox**. The caller-supplied test command retains the operating-system/network capabilities of the environment in which the sweep is invoked. Use the narrowest practical project root and do not pass secrets to the test command.

The tool's local self-gate is **7/7 passing**, including positive and negative integration cases, source-preservation checks, UTF-8 source-span handling, nested-scope classification, and a case proving that a literal string containing `VERIFIED` cannot hide a refusal guard.

## Scope boundary

This prototype does **not** modify TRACE wire format, treat resolved references as attested truth, invalidate TRACE because a reference cannot be resolved, or verify TRACE signatures itself. It remains a composition layer.
