# Verification spec

The heart of TokenPact is the **acceptance predicate** — the machine-checkable
conditions a provider's output must satisfy before escrow is released. If it
can't be checked by a machine, it can't gate a payment.

> Don't trust the output. **Test it.**

## Anatomy of a task spec

A task spec (validated by `TaskSpecSchema` in `packages/core/src/spec.ts`) pairs
a natural-language ask with a list of checks. **All checks must pass** — the
predicate is their logical AND.

```jsonc
{
  "id": "fibonacci-demo",
  "task": "Write a Python function fib(n) that returns the n-th Fibonacci number.",
  "acceptIf": [
    { "kind": "compiles" },
    { "kind": "tests_pass", "suite": "tests/", "minPassRatio": 1 },
    { "kind": "latency", "metric": "p95", "ltMs": 50 },
    { "kind": "schema_match", "schema": { "type": "integer", "minimum": 0 } }
  ],
  "reward": { "amount": "0.25", "asset": "USDC", "network": "base-sepolia" }
}
```

This is the deck's predicate — `compiles && tests_pass && p95 < 50ms && schema_match`
— expressed as structured data instead of a string, so the verifier can execute
it deterministically and report per-check detail.

## Check kinds

| `kind` | Parameters | Passes when |
| --- | --- | --- |
| `compiles` | — | The submitted code compiles / type-checks (sandbox exit code `0`). |
| `tests_pass` | `suite`, `minPassRatio` (0–1, default `1`) | The test suite runs and the pass ratio ≥ `minPassRatio`. |
| `latency` | `metric` (`mean`\|`p95`\|`p99`), `ltMs` | The measured percentile over repeated sandbox runs is `< ltMs`. |
| `schema_match` | `schema` (JSON Schema) | The output artifact validates against `schema`. |
| `custom` | `name`, `params` | A named verifier plugin returns pass. Escape hatch for bespoke checks. |

Every check produces a `CheckResult` with a boolean `passed`, a human-readable
`detail` (e.g. `"18/18"`, `"p95 = 31ms"`), and optional structured `metrics`
for the ledger. The overall `VerificationResult.passed` is true only if every
check passed.

## Example verdict

```jsonc
{
  "taskId": "fibonacci-demo",
  "passed": true,
  "results": [
    { "check": "compiles",     "passed": true, "detail": "ok" },
    { "check": "tests_pass",   "passed": true, "detail": "18/18" },
    { "check": "latency",      "passed": true, "detail": "p95 = 31ms", "metrics": { "p95Ms": 31 } },
    { "check": "schema_match", "passed": true, "detail": "match" }
  ],
  "verifier": "tokenpact-verifier@local",
  "signature": "0x…",
  "verifiedAt": 1756000000000
}
```

`PASS` → escrow released to the provider. `FAIL` → escrow refunded to the buyer.
No human reviewed either outcome.

## Design principles

1. **Objective over subjective.** Prefer checks a machine can decide the same
   way every time. "Looks good" is not a check; "passes these 12 tests" is.
2. **The spec is the contract.** The buyer commits to the predicate up front;
   the provider knows exactly what "done" means before starting.
3. **Sandbox everything.** Provider output is untrusted code. Checks run under
   hard time / memory / CPU limits with no network. See
   [`SECURITY.md`](../SECURITY.md).
4. **Signed, auditable verdicts.** A verdict carries the verifier's identity and
   a signature so the settlement — and any dispute — can be audited later.

## Extending

Add a new check by extending the discriminated union in
`packages/core/src/spec.ts` and handling the new `kind` in the verifier's
`runCheck` switch (`apps/verifier/src/index.ts`). The compiler will flag the
missing case for you — the switch is exhaustively typed.
