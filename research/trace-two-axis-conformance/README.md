# TRACE two-axis verification: independence conformance matrix

**Author:** Val Rukhaylo (`altrudev`)  
**Date:** 2026-08-25  
**Status:** External conformance note / informative. This is not a normative TRACE schema proposal.

## Purpose

TRACE #66 has already made the key architectural decision: supply-chain verification depth and intra-run action-receipt verification are **independent axes**, not levels in one ordered ladder.

This note proposes a small falsification-oriented fixture set whose only purpose is to demonstrate that independence in verifier behavior. It deliberately does **not** define receipt cryptography, causal freshness, replay semantics, physical-outcome claims, or new schema fields; those topics already have substantive work in the #66 discussion.

The property to defend is:

```text
supply-chain depth must not imply action-receipt verification
AND
action-receipt verification must not imply supply-chain depth
```

A verifier should report what it actually established on each axis, and failure/downgrade on one axis should not silently upgrade, erase, or reinterpret the other.

## Why explicit independence fixtures help

The two-axis model is easy to state and easy to accidentally collapse in an implementation. A single score, convenience enum, shared success flag, or poorly composed appraisal branch can recreate the false ordering #66 was designed to avoid.

A conformance set should therefore contain **witnesses that would be impossible if the axes were coupled**.

## Candidate fixture matrix

Names below are local placeholders, not proposed TRACE conformance IDs.

| Fixture | Supply-chain evidence | Action-receipt evidence | Property exercised |
|---|---|---|---|
| AXIS-A | `surface` only | complete, valid receipt set | Receipt success must not upgrade build provenance above `surface`. |
| AXIS-B | verified `transitive` provenance | no receipts, receipts not required | Deep supply-chain verification must not imply receipt verification. |
| AXIS-C | verified `transitive` provenance | required receipt missing | Build provenance remains independently established while the required receipt condition fails. |
| AXIS-D | requested `transitive`, only `builder` can be established because higher-depth evidence is unresolved | complete, valid required receipts | Honest supply-chain downgrade must not downgrade or erase a separately verified receipt axis. |
| AXIS-E | supply-chain evidence resolves and contradicts the record | complete, valid receipts | A valid receipt set must not launder contradictory build provenance into an affirming overall appraisal. |
| AXIS-F | supply-chain depth fully verified | receipt present but invalid | Deep provenance must not convert invalid action evidence into valid or merely absent receipt evidence. |

These fixtures are intentionally about **composition**, not the internal reason a receipt is valid/invalid. Existing or separately proposed receipt vectors can supply those inputs.

## Mutation criterion

For each fixture, neutralize the cross-axis separation and require at least one expected outcome to change. Examples of mutations worth detecting:

1. assign receipt success from `provenance_depth_verified != null`;
2. assign `provenance_depth_verified = transitive` when receipts are fully verified;
3. replace two axis results with one boolean `verified` and reconstruct both from it;
4. on supply-chain downgrade, also downgrade an already verified receipt result;
5. on receipt failure, erase a separately established supply-chain depth;
6. allow success on one axis to overwrite a contradiction already established on the other.

If a mutation like these leaves the full independence fixture set green, the set is not yet demonstrating the architectural decision it claims to protect.

## Expected reporting boundary

The matrix assumes only the semantics already described in #66 and current verification guidance:

- `provenance_depth_verified` records the supply-chain depth the verifier actually executed; it may honestly downgrade when evidence does not resolve and must not upgrade beyond checks performed.
- action receipts are separately evaluated intra-run evidence.
- a required missing receipt is distinct from an invalid receipt and from a valid negative controller outcome.
- successful receipt verification does not prove physical completion.
- evidence that resolves and contradicts the record is not converted into a benign downgrade.

The exact final field names and v1.0 editorial wording remain maintainer-controlled. The fixtures can be adapted to the final vocabulary without changing the independence property.

## Minimal acceptance property

A future executable conformance version of this matrix should be able to make the following statement:

> For every tested pair of supply-chain and action-receipt conditions, changing only one axis changes only the claims that depend on that axis, except where the overall appraisal policy explicitly composes the two. The verifier never infers a stronger result on an unexecuted axis from success on the other.

This does not mean the overall appraisal cannot fail when either required axis fails. It means the **evidence accounting remains truthful and separable** even when policy combines the results.

## Relationship to existing #66 work

This is complementary to, not a substitute for:

- receipt completeness/signature/session-binding fixtures;
- causal freshness, authority epoch, fencing or replay vectors;
- embodied physical-outcome separation;
- relying-party assurance-language matrices;
- the maintainer editorial work that defines final v1.0 schema and verification language.

It consumes those outcomes as test inputs and asks one narrower question: **did implementation preserve the independence of the two axes?**

## DDC boundary

This note treats test success, verification depth, receipt validity, overall appraisal, physical outcome, authority, and provenance as distinct claims. No one result is allowed to create authority or evidence for another by implication alone.

## References

- `agentrust-io/trace-spec#66` — two-axis verification decision
- `agentrust-io/trace-spec/docs/verification.md` — current provenance-depth and action-receipt verification guidance
- `altrudev/Calibration-Studio#7` — related external work on executable evidence separation and guard mutation
