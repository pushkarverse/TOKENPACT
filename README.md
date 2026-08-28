# TokenPact

**Reverse escrow for autonomous AI agents.**
Don't pay for promises. Pay for proof.

When one AI agent hires another, today's flow is *pay → receive → hope*. TokenPact
inverts it. Money locks in escrow **before** work begins; an independent verifier
machine-checks the output against a spec the buyer wrote; and the x402 payment rail
releases funds **only on proof** — otherwise the buyer is automatically refunded.

```
        today                         TokenPact
   pay → receive → hope     REQUEST → PRODUCE → VERIFY → PAY
                            (funds escrowed at REQUEST,
                             released only if VERIFY passes)
```

---

## Run it (one command, zero install)

Requires **Node.js ≥ 22.6** — nothing else. No `npm install`, no build step, no network.
The server runs TypeScript directly using Node's built-in type stripping.

```bash
cd tokenpact
npm start
# → http://localhost:4021
```

Open the URL and click **Run the pact**.

On Node 22.6–22.17, use `npm run start:compat` (adds the `--experimental-strip-types`
flag). On Node ≥ 22.18 the plain `npm start` works because type stripping is on by
default. To run on a different port: `PORT=5000 npm start`.

Prefer the terminal? `npm run smoke` runs all three provider agents through the full
flow and prints what the verifier decided.

---

## The demo (90 seconds)

The buyer agent posts one task — **implement `isPrime(n)`** — with a machine-checkable
acceptance condition:

```
accept_if:  compiles && tests_pass && p95 < 50ms && schema_match
price:      $0.08   (escrowed up front)
```

Pick which provider agent answers, then run the pact and watch the seal:

| Provider   | What it does                                   | Verifier verdict            | Escrow outcome        |
|------------|------------------------------------------------|-----------------------------|-----------------------|
| **Honest** | √n trial division — correct and fast           | 12/12 tests · p95 ~0.1ms    | **RELEASED** → provider |
| **Faulty** | "assume every odd number is prime"             | **7/12** tests fail         | **REFUNDED** → buyer  |
| **Slow**   | correct but O(n) — clears tests, misses budget | 12/12 tests · **p95 ~150ms** | **REFUNDED** → buyer  |

The punchline: **the two failing providers fail for completely different reasons**
(wrong answers vs. too slow), and the buyer pays for neither. The verifier ran their
*actual code* — it didn't trust a claim. The Faulty case reproduces the exact 7/12 from
the pitch deck.

Every run appends a signed line to the settlement ledger, and the running tally shows
how much was released on proof versus refunded on failure.

---

## Why this is more than a mock

The verification is **real**. When you run a pact, the verifier writes the provider's
code to a sandbox and executes it in a **separate Node process with a hard timeout**,
runs the unit tests, measures p95 latency against a large-prime probe, and checks the
return schema. The Slow provider genuinely blows the latency budget because the probe
input (`100000007`, a prime) forces its O(n) loop to run ~10⁸ iterations while the √n
implementation clears it in microseconds. Nothing is faked — swap in your own buggy
code and the verdict changes accordingly.

What's **simulated** is only the settlement rail: instead of moving USDC on-chain, the
x402 layer reproduces the same state transitions (`402 Payment Required` → escrow
`LOCKED` → `RELEASED` | `REFUNDED`) in memory, so the whole flow runs at a hackathon
demo without a wallet or testnet. See [Roadmap](#roadmap) for the real-x402 swap.

---

## Architecture

Three planes, mirroring the pitch:

```
  INTENT plane            EXECUTION plane              SETTLEMENT plane
  ────────────            ───────────────              ────────────────
  buyer agent             provider agent               verification result
  task + accept_if        produces code                x402 release / refund
  escrow LOCKED   ───▶    independent verifier   ───▶  signed ledger entry
                          runs the REAL code
                          (sandboxed child proc)
```

The verifier is the crux: **it is never paid by the provider**, and it executes the
work rather than trusting any claim about it. Its verdict is signed.

### Code map

```
src/
  types.ts            shared domain vocabulary (one language for every plane)
  scenarios.ts        the isPrime task spec + three real provider implementations
  x402.ts             simulated x402 rail: 402 offer, escrow, settlement hash
  verifier/
    runner.ts         the verifier agent — spawns the sandbox, signs the verdict
    harness.ts        runs INSIDE a child process: loads candidate code, runs
                      tests, measures latency, checks schema (untrusted-code boundary)
  store.ts            in-memory orchestration + the LOCKED → RELEASED|REFUNDED machine
  server.ts           zero-dependency HTTP server + JSON API
  util.ts             money formatting

public/
  index.html          the dashboard
  styles.css          the "Vault" design system
  app.js              flow orchestration + animated verifier receipt (vanilla JS)

scripts/
  smoke.ts            CLI walk-through of all three scenarios
```

### API

| Method | Route                        | Purpose                                            |
|--------|------------------------------|----------------------------------------------------|
| GET    | `/api/state`                 | task spec, provider catalog, ledger, running tally |
| POST   | `/api/tasks`                 | buyer authors task → funds lock in escrow          |
| POST   | `/api/tasks/:id/produce`     | provider produces code (`{scenario}`)              |
| POST   | `/api/tasks/:id/verify`      | verifier runs sandbox → release or refund          |
| GET    | `/api/ledger`                | settled transactions + tally                       |

---

## Design notes

Zero runtime dependencies — everything is Node built-ins and hand-written CSS/JS. That's
a deliberate choice: the demo starts with one command, can't break on a failed install,
and needs no network. It also keeps the trust story clean — there's no third-party code
between you and the verifier.

The interface is a custom "Vault" visual language (warm charcoal, gold foil, monospace
ledgers) rather than a stock dashboard theme.

---

## Roadmap

- **Real x402 settlement** — replace `src/x402.ts` with a live x402 facilitator so escrow
  release moves USDC on Base. The state machine in `store.ts` is already shaped for it.
- **Pluggable verifiers** — today the verifier runs unit tests, latency, and schema.
  The `Check` type is generic; add checks for output diffing, property-based tests, or
  LLM-graded rubrics for non-code tasks.
- **Multi-language sandboxes** — the harness boundary is process-isolated; a container
  runner would let providers answer in any language.
- **Verifier staking / reputation** — make verifier independence economically enforced,
  not just architectural.

---

**Team TechCrunch** — Anwesha Mondal · Dev Krrish Sinha · Pushkar Kumar
Prototype for round 2. MIT licensed.
