# Evaluator Calibration

Calibration Studio can score an evaluator against separately held ground truth without importing the evaluator's private implementation.

## Boundary

```text
case payloads
  -> evaluator predictions while truth is withheld
  -> predictions frozen
  -> independent truth revealed
  -> Calibration Studio scoring
  -> bounded calibration result
```

The scorer separates blinded from retrospective cases and excludes self-derived specification truth from qualification when policy requires independent ground truth.

It measures decision accuracy, macro F1, unsafe false-negative rate, abstention, repeated-run stability, severity error, and reason-code agreement.

## CLI

```bash
calibrate evaluator-calibrate \
  --cases cases.json \
  --truth truth.json \
  --predictions predictions.json \
  --policy policy.json
```

Result states:

- `INSUFFICIENT_EVIDENCE`
- `NOT_CALIBRATED`
- `CALIBRATED_FOR_DEFINED_CORPUS`

The final state is explicitly corpus/revision/policy bounded. It is not accreditation or universal evaluator validity.
