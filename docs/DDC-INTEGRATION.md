# DDC ↔ Calibration Studio integration

## Boundary

Calibration Studio is a standalone software-assurance product. DDC / Crystalline is a separate private research and runtime repository.

This public repository MUST NOT contain private DDC transaction-closure implementation, topology propagation, constraint-island internals, successor-state machinery, private dimensional signals, or private research configuration.

The relationship is deliberately bidirectional at the product boundary:

```text
Software project ──► Calibration Studio
                         │
                         │ reports / gates / traces / repair evidence
                         ▼
                    developer / CI

DDC repository ─────► Calibration Studio
                         │
                         │ self-calibration evidence
                         ▼
                    DDC maintenance

Calibration Studio ─► optional DDC provider
                         │
                         │ private analysis behind explicit local contract
                         ▼
                    DDC / Crystalline
```

Calibration Studio does not need private DDC internals to define or serialize its public artifacts. A private DDC provider may perform additional analysis locally, but its internal signals are never serialized into public Calibration Studio artifacts.

## Canonical ownership

- Calibration Studio product/runtime/adapters/lifecycle/release code: `altrudev/Calibration-Studio`
- DDC / Crystalline core and private research: `altrudev/ddc`
- HTP protocol/reference implementation: `altrudev/HTP`

The embedded `apps/calibration-studio/` tree in DDC is migration-only after the extraction branch reaches parity with DDC v0.10.1.

## DDC self-calibration

DDC consumes Calibration Studio as an external tool. DDC owns the self-calibration plan and the expected baseline; Calibration Studio owns execution, evidence, regression tracing, repair verification and release-gate semantics.

The DDC repository should provide a checked-in plan under its integration boundary. The plan may identify public checks and executable test commands, but it must not require Calibration Studio to understand private DDC topology.

Expected flow:

```text
DDC commit
  -> Calibration Studio capture/run
  -> approved DDC baseline
  -> continuous gate
  -> first-bad historical trace on regression
  -> affected repair scope
  -> repair verification
  -> signed/reproducible evidence bundle
```

## Provider contract

Any private DDC provider is optional and local. The provider receives an allow-listed request and returns an allow-listed response. The default public Calibration Studio engine must remain usable without that provider.

Provider rules:

1. no private DDC source or configuration is copied into this repository;
2. provider execution requires explicit local configuration;
3. provider input/output is versioned and schema validated;
4. private dimensional signals remain process-local;
5. public artifacts are built from documented Calibration Studio fields only;
6. provider absence must fail clearly or fall back only where the contract explicitly permits it;
7. provider output is evidence, never silent authority over developer-owned expectations.

## Release independence

Calibration Studio and DDC version independently. Integration pins must identify compatible protocol versions rather than assuming matching product versions.

A Calibration Studio release must never require access to the private DDC GitHub repository at runtime.
