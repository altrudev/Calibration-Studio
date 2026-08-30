from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from verifier_boundary_matrix import (  # noqa: E402
    Mutation,
    evaluate_boundary,
    evaluate_prerequisite_monotonicity,
    mutate,
)


def test_mutation_does_not_modify_source() -> None:
    source = {"trace": {"cnf": {"jwk": {"x": "ok"}}}}
    mutated = mutate(source, Mutation(("trace", "cnf"), "bad"))

    assert source["trace"]["cnf"] == {"jwk": {"x": "ok"}}
    assert mutated["trace"]["cnf"] == "bad"


def test_result_boundary_accepts_structured_failure() -> None:
    def verifier(value):
        if not isinstance(value.get("trace"), dict):
            return {"failure": "CLAIM_MALFORMED"}
        return {"failure": None}

    result = evaluate_boundary(
        verifier,
        {"trace": {}},
        Mutation(("trace",), "bad"),
        expected_mode="return",
    )

    assert result.passed


def test_host_language_exception_is_a_boundary_failure() -> None:
    def verifier(value):
        return value.get("trace", {}).get("cnf")

    result = evaluate_boundary(
        verifier,
        {"trace": {}},
        Mutation(("trace",), "bad"),
        expected_mode="return",
    )

    assert not result.passed
    assert "AttributeError" in result.reason


def test_documented_exception_boundary_is_supported() -> None:
    def verifier(value):
        if not isinstance(value.get("hop"), dict):
            raise ValueError("hop must be an object")
        return None

    result = evaluate_boundary(
        verifier,
        {"hop": {}},
        Mutation(("hop",), "bad"),
        expected_mode="raise",
        allowed_exceptions=(ValueError,),
    )

    assert result.passed


def test_prerequisite_failure_survives_downstream_mutation() -> None:
    def verifier(value):
        if not isinstance(value.get("trace"), dict):
            return {"failure": "CLAIM_MALFORMED"}
        if value.get("signature") == "bad":
            return {"failure": "SIGNATURE_INVALID"}
        return {"failure": None}

    result = evaluate_prerequisite_monotonicity(
        verifier,
        {"trace": {}, "signature": "ok"},
        Mutation(("trace",), "bad"),
        Mutation(("signature",), "bad"),
        failure_getter=lambda value: value["failure"],
        expected_failure="CLAIM_MALFORMED",
    )

    assert result.passed


def test_prerequisite_overwrite_is_detected() -> None:
    def verifier(value):
        failure = None
        if not isinstance(value.get("trace"), dict):
            failure = "CLAIM_MALFORMED"
        if value.get("signature") == "bad":
            failure = "SIGNATURE_INVALID"
        return {"failure": failure}

    result = evaluate_prerequisite_monotonicity(
        verifier,
        {"trace": {}, "signature": "ok"},
        Mutation(("trace",), "bad"),
        Mutation(("signature",), "bad"),
        failure_getter=lambda value: value["failure"],
        expected_failure="CLAIM_MALFORMED",
    )

    assert not result.passed
    assert "SIGNATURE_INVALID" in result.reason
