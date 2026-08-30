"""Verifier Boundary Matrix research core.

This module is intentionally dependency-free.  It does not decide what a
verifier *should* accept.  It checks whether an adapter preserves a declared
public boundary when untrusted input is mutated across structural edges.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Callable, Literal


# These exceptions usually describe an implementation accident at an external
# data boundary rather than a deliberate verifier API.  A target may still
# declare a different documented exception boundary explicitly.
FORBIDDEN_HOST_EXCEPTIONS = (AttributeError, KeyError, TypeError, IndexError)


@dataclass(frozen=True)
class Mutation:
    """Replace one value in a nested input without mutating the source object."""

    path: tuple[str | int, ...]
    value: Any


@dataclass(frozen=True)
class Outcome:
    """Normalized observation of one verifier invocation."""

    mode: Literal["return", "raise"]
    value: Any = None
    exception: Exception | None = None


@dataclass(frozen=True)
class Evaluation:
    """One falsifiable matrix result."""

    passed: bool
    reason: str
    outcome: Outcome


def mutate(base: Any, mutation: Mutation) -> Any:
    """Return a deep-copied input with exactly one path replaced.

    A bad experiment definition is a harness error, not a verifier result, so an
    invalid path raises ValueError before the target is invoked.
    """

    target = deepcopy(base)
    if not mutation.path:
        return deepcopy(mutation.value)

    cursor = target
    for part in mutation.path[:-1]:
        try:
            cursor = cursor[part]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError(f"mutation path does not exist at {part!r}") from exc

    leaf = mutation.path[-1]
    try:
        cursor[leaf] = deepcopy(mutation.value)
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"mutation path cannot be assigned at {leaf!r}") from exc
    return target


def probe(adapter: Callable[[Any], Any], value: Any) -> Outcome:
    """Invoke a verifier adapter and normalize return-vs-exception behavior."""

    try:
        return Outcome("return", value=adapter(value))
    except Exception as exc:  # noqa: BLE001 - exception type is the observation
        return Outcome("raise", exception=exc)


def evaluate_boundary(
    adapter: Callable[[Any], Any],
    base: Any,
    mutation: Mutation,
    *,
    expected_mode: Literal["return", "raise"],
    allowed_exceptions: tuple[type[Exception], ...] = (),
) -> Evaluation:
    """Check the external failure boundary for one structural mutation.

    Examples:
    - result-returning verifier: ``expected_mode="return"``;
    - verifier documenting ``ValueError``: ``expected_mode="raise"`` with
      ``allowed_exceptions=(ValueError,)``.

    Raw AttributeError/KeyError/TypeError/IndexError always fail the matrix.
    """

    outcome = probe(adapter, mutate(base, mutation))
    if outcome.mode == "raise":
        assert outcome.exception is not None
        if isinstance(outcome.exception, FORBIDDEN_HOST_EXCEPTIONS):
            return Evaluation(
                False,
                f"host-language exception leaked: {type(outcome.exception).__name__}",
                outcome,
            )
        if expected_mode == "return":
            return Evaluation(
                False,
                f"expected return, got {type(outcome.exception).__name__}",
                outcome,
            )
        if not isinstance(outcome.exception, allowed_exceptions):
            return Evaluation(
                False,
                f"unexpected exception type: {type(outcome.exception).__name__}",
                outcome,
            )
        return Evaluation(True, "documented exception boundary preserved", outcome)

    if expected_mode == "raise":
        return Evaluation(False, "expected documented exception, verifier returned", outcome)
    return Evaluation(True, "return boundary preserved", outcome)


def evaluate_prerequisite_monotonicity(
    adapter: Callable[[Any], Any],
    base: Any,
    prerequisite: Mutation,
    downstream: Mutation,
    *,
    failure_getter: Callable[[Any], str | None],
    expected_failure: str,
) -> Evaluation:
    """Check that a downstream mutation cannot launder an established failure.

    The prerequisite mutation is evaluated alone and then together with a
    downstream mutation.  Both invocations must return through the verifier's
    result boundary and retain ``expected_failure``.

    This is deliberately not a universal ordering rule.  The caller supplies the
    expected prerequisite failure only when the target's own contract establishes
    that precedence.
    """

    prerequisite_value = mutate(base, prerequisite)
    first = probe(adapter, prerequisite_value)
    second = probe(adapter, mutate(prerequisite_value, downstream))

    for label, outcome in (("prerequisite", first), ("combined", second)):
        if outcome.mode == "raise":
            assert outcome.exception is not None
            return Evaluation(
                False,
                f"{label} mutation raised {type(outcome.exception).__name__}",
                outcome,
            )
        actual = failure_getter(outcome.value)
        if actual != expected_failure:
            return Evaluation(
                False,
                f"{label} failure changed to {actual!r}; expected {expected_failure!r}",
                outcome,
            )

    return Evaluation(
        True,
        "prerequisite failure is monotonic under downstream mutation",
        second,
    )
