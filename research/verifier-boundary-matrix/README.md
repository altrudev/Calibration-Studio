# Verifier Boundary Matrix

A small adversarial research harness for testing where trust/verifier implementations establish structure, meaning, and failure precedence.

The experiment was prompted by three independently observed AgenTrust failure paths:

- TRACE `provenance.verify_record()` read `cnf.jwk` through `(record.get("cnf") or {}).get(...)`, allowing malformed `cnf` shapes to escape or be treated as absence (#251 / PR #252).
- cMCP `verify_trace_claim()` records schema failure and then continues into structure-dependent signature/key-binding logic, allowing host-language exceptions and possible failure-reason overwrite (#592 / draft PR #596).
- Agent Manifest `verify_delegation_chain()` interpreted the chain root before its structural validator ran (#356 / PR #357).

These are instances of the same testable class:

> A verifier interprets data before the prerequisite that establishes the data's structure or meaning.

## Properties

### VBM-1 — External boundary integrity

For malformed untrusted input, a verifier must stay inside its declared public failure boundary.

That boundary is target-specific:

- a result-returning verifier may return `UNVERIFIED` / an error code;
- an exception-based verifier may deliberately raise a documented domain exception such as `ValueError` or `ProvenanceError`.

The matrix therefore does **not** impose one universal API style. It detects incidental `AttributeError`, `KeyError`, `TypeError`, and `IndexError` leakage unless the target explicitly declares a different contract.

### VBM-2 — Prerequisite monotonicity

When a target's own contract establishes prerequisite failure `P`, adding a downstream fault must not silently replace `P` with a more specific interpretation that requires `P` to have succeeded.

Example:

```text
schema malformed
      ↓
CLAIM_MALFORMED
      ↓ add invalid signature
CLAIM_MALFORMED          expected when schema validity is prerequisite
SIGNATURE_INVALID        laundering/overwrite if signature interpretation depended on schema
```

This property is opt-in. The harness never invents failure precedence: the experiment author must supply the expected prerequisite failure from the target's specification or maintainer ruling.

### VBM-3 — Failure-path independence

A positive control alone is insufficient. Each claimed boundary is exercised by mutation at the exact structural edge that would otherwise reach a host-language operation such as `.get()`, indexing, `len()`, set construction, or numeric comparison.

## What this does not claim

The matrix is evidence, not authority. Discovering a crash or precedence differential does not by itself decide:

- which malformed values should become valid;
- which error code should be normative;
- whether two semantically similar values should bind identically;
- whether a later security signal is allowed to outrank an earlier prerequisite failure.

Those remain specification/maintainer decisions.

## Core API

`src/verifier_boundary_matrix.py` provides:

- `Mutation` — one nested structural perturbation;
- `probe()` — normalized return-vs-exception observation;
- `evaluate_boundary()` — declared-boundary check;
- `evaluate_prerequisite_monotonicity()` — optional failure-precedence check.

The core is standard-library only so it can be copied beside or imported from arbitrary verifier checkouts without adding dependencies to the target repository.

## Reproduction

From this directory:

```bash
python -m pytest -q tests/test_verifier_boundary_matrix.py
```

The unit suite uses synthetic verifier functions to prove the harness itself detects both exception leakage and failure overwrite. Target-specific adapters are added only when the target's public contract and construction requirements are known.

## Current evidence baseline

| Target | Pinned baseline | Public finding | Boundary under test |
|---|---|---|---|
| `agentrust-io/trace-spec` | `25013c59d607860a4a4d2608476280286f688243` | #251 / PR #252 | documented `ProvenanceError` |
| `agentrust-io/cmcp` | `2c0a601805bfb31fddc49db32ae122bae8e2251e` | #592 / draft PR #596 | `VerificationResult`, no host exception |
| `agentrust-io/agent-manifest` | `eb747f5fd610a8d7fa360e52faaea5db578e6b34` | #356 / PR #357 | documented `ValueError` |

Pinned hashes matter: once upstream moves, the observation must be rerun rather than assumed to remain true.

## DDC disposition

The experiment follows the standing DDC principles at registry commit `5f836d8e63db21c42b14d68b54eaaa3d48f499ce`:

- Need ≠ Authority — the existence of a failure does not authorize a semantic change.
- Evidence ≠ Authority — a reproducer demonstrates behavior but does not choose the normative fix.
- Verification ≠ Validation ≠ Correctness — boundary integrity is tested independently from semantic correctness.
- Non-Redundant Build — target-side structural authorities are reused rather than re-specified when a fix is proposed.
- Failure-Path Independence — adversarial vectors make the claimed boundary load-bearing.
- Ambiguity must not become authority — precedence checks are opt-in until the target contract establishes an ordering.
