# Verification spec

The heart of TokenPact is the **acceptance predicate** — the machine-checkable
conditions a provider's output must satisfy before escrow is released. If it
can't be checked by a machine, it can't gate a payment.

> Don't trust the output. **Test it.**

## Anatomy of a task spec

A task spec is the `TaskSpec` type in `packages/core/src/types.ts`. It pairs a
natural-language ask with a machine-checkable `acceptIf` condition and the data
the verifier needs to decide it: the required function name, a list of test
cases, and a latency probe. **All four checks must pass** — the predicate is
their logical AND.

The demo spec (authored in `packages/core/src/scenarios.ts`) looks like this:

```jsonc
{
  "id": "spec_isprime_v1",
  "title": "Primality check",
  "task": "Implement isPrime(n): return true iff n is a prime number.",
  "fn": "isPrime",
  "language": "javascript",
  "tests": [
    { "input": [1],  "expected": false },
    { "input": [2],  "expected": true  },
    { "input": [17], "expected": true  },
    { "input": [25], "expected": false }
    // … 12 cases in total
  ],
  "latencyProbe": { "input": [100000007], "iterations": 60 },
  "acceptIf": {
    "compiles": true,
    "testsMustAllPass": true,
    "p95BudgetMs": 50,
    "schema": "boolean",
    "humanExpr": "compiles && tests_pass && p95 < 50ms && schema_match"
  },
  "priceCents": 8
}
```

That's the deck's predicate — `compiles && tests_pass && p95 < 50ms && schema_match`
— expressed as structured data, so the verifier can execute it deterministically
and report per-check detail. The `humanExpr` string is only for display; the
booleans and budgets above are what actually gate the money.

The latency probe is a deliberately large prime (`100000007`). A √n
implementation clears it in microseconds; a naive O(n) implementation must loop
~10⁸ times and blows the budget — which is how the **slow** provider passes every
unit test yet still gets refunded.

## The four checks

The verifier always runs the same four checks, in order. Each produces a `Check`
(`{ id, label, detail, status }`) for the receipt; the ids are fixed in
`packages/core/src/types.ts`.

| `id` | Passes when |
| --- | --- |
| `compiles` | The submitted code loads and defines the required function (`spec.fn`). A syntax error or a missing function fails here, and every later check fails closed. |
| `tests` | Every case in `spec.tests` returns a value deep-equal to `expected` (`testsPassed === testsTotal`). |
| `latency` | The measured **p95** over `latencyProbe.iterations` runs is `≤ acceptIf.p95BudgetMs`, and the run was not time-capped. |
| `schema` | `typeof output` equals `acceptIf.schema` (e.g. `"boolean"`) — a lightweight runtime type check on the return value. |

The overall `VerificationResult.passed` is true only if the tests, latency, and
schema checks all pass (each of which already requires `compiles`).

## Example verdict

`verify(spec, output)` (in `apps/verifier/src/runner.ts`) returns a signed
`VerificationResult`:

```jsonc
{
  "checks": [
    { "id": "compiles", "label": "Code compiles",          "detail": "loaded",        "status": "pass" },
    { "id": "tests",    "label": "Unit tests",             "detail": "12 / 12",       "status": "pass" },
    { "id": "latency",  "label": "Latency p95 < 50ms",     "detail": "0.291ms ≤ 50ms","status": "pass" },
    { "id": "schema",   "label": "Output schema",          "detail": "boolean = boolean", "status": "pass" }
  ],
  "compiled": true,
  "testsPassed": 12,
  "testsTotal": 12,
  "p95Ms": 0.291,
  "p95BudgetMs": 50,
  "schemaExpected": "boolean",
  "schemaGot": "boolean",
  "schemaMatch": true,
  "timedOut": false,
  "passed": true,
  "verifier": "verifier.independent.agent",
  "signature": "sig_…",
  "ranAt": 1756000000000,
  "durationMs": 42
}
```

`passed: true` → escrow released to the provider. `passed: false` → escrow
refunded to the paying wallet. No human reviewed either outcome.

## Design principles

1. **Objective over subjective.** Prefer checks a machine can decide the same
   way every time. "Looks good" is not a check; "passes these 12 tests" is.
2. **The spec is the contract.** The buyer commits to the predicate up front;
   the provider knows exactly what "done" means before starting.
3. **Fail closed.** If the sandbox produces nothing usable — a crash, or a
   timeout — every check is marked failed and the money is refunded, never
   released on ambiguity.
4. **Sandbox everything.** Provider output is untrusted code. It runs in a
   separate child process with a hard wall-clock timeout (and a latency cap on
   the probe loop). Enforced CPU/memory/network isolation is on the roadmap; see
   [`SECURITY.md`](../SECURITY.md).
5. **Signed, auditable verdicts.** A verdict carries the verifier's identity and
   a signature over the result, so the settlement — and any dispute — can be
   audited later. The prototype uses a demo signing key; independent,
   multi-verifier attestation is on the roadmap.

## Extending

The check set is intentionally small and fixed for the demo. To add a new check:

1. Add its `id` to the `Check` union in `packages/core/src/types.ts` (and any new
   fields it needs on `AcceptIf` / `VerificationResult`).
2. Measure it in the sandbox harness (`apps/verifier/src/harness.ts`), which runs
   the untrusted code and emits raw results.
3. Fold it into the verdict in `apps/verifier/src/runner.ts` — push a `Check` and
   include it in the `passed` conjunction.

Because the `id` union is exhaustively typed, the compiler will point you at
every place that needs updating.
