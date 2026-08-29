# Architecture

TokenPact is an **autonomous, quality-gated payment layer** for AI agents. It
sits between an agent that wants work done and an agent (or API) that does it,
and it guarantees one property that plain payments cannot:

> Payment is released **only** when the output provably meets the spec.

The system is organized into three planes. Data flows left to right; money only
moves at the very end, and only on proof.

```mermaid
flowchart LR
    subgraph Intent["🧠 Intent plane"]
        A1[1 · Buyer agent]
        A2[2 · Task / spec layer]
        A3[3 · Payment escrow]
    end
    subgraph Exec["⚙️ Execution plane"]
        B4[4 · Service provider]
        B5[5 · Output artifact]
        B6[6 · Independent verifier]
    end
    subgraph Settle["💸 Settlement plane"]
        C7[7 · Verification result]
        C8[8 · x402 settlement]
        C9[9 · Payment rail / ledger]
    end

    A1 --> A2 --> A3 --> B4 --> B5 --> B6 --> C7 --> C8 --> C9
```

**Invariant:** the verifier is **never paid by the provider**. It is an
independent party (or the buyer's own trusted checker). This separation is what
makes the verdict trustworthy — the entity judging the work has no incentive to
pass bad output.

## The core loop

```mermaid
sequenceDiagram
    autonumber
    participant B as Buyer agent
    participant O as Orchestrator (escrow)
    participant P as Provider agent
    participant V as Verifier (sandbox)

    B->>O: POST /api/tasks
    O-->>B: 402 Payment Required + x402 offer  (escrow AWAITING_PAYMENT)
    B->>O: POST /api/tasks/:id/pay + X-PAYMENT (signed)
    O->>O: verify payment, lock escrow  (AWAITING_PAYMENT → LOCKED)
    O-->>B: 200 + X-PAYMENT-RESPONSE
    P->>O: POST /api/tasks/:id/produce { scenario }
    P->>O: POST /api/tasks/:id/verify
    O->>V: verify(spec, output)
    V->>V: compile · tests · latency · schema  (in sandbox)
    V-->>O: signed VerificationResult { passed, checks }
    alt passed
        O->>O: LOCKED → RELEASED
        O->>P: settle escrow → provider
    else failed
        O->>O: LOCKED → REFUNDED
        O->>B: settle escrow → buyer (the paying wallet)
    end
```

## Components

| Component | Package | Responsibility |
| --- | --- | --- |
| **Orchestrator** | `apps/orchestrator` | Owns the escrow state machine, issues x402 payment requirements, coordinates verification, executes settlement, writes the transaction log. |
| **Verifier** | `apps/verifier` | Runs the acceptance checks from `spec.acceptIf` inside a sandbox and returns a signed PASS/FAIL verdict with per-check detail. |
| **Buyer agent** | `agents/buyer` | Composes a task + spec, funds escrow over x402, waits for settlement. |
| **Provider agent** | `agents/provider` | Produces an output artifact for a task. Paid only on proof. |
| **Core** | `packages/core` | Shared vocabulary: task-spec schema, domain types, escrow state machine. |

## Escrow state machine

The orchestrator can only move funds along the legal transitions of the
`EscrowState` type defined in `packages/core/src/types.ts`. There is exactly one
path to `RELEASED`, and it runs through a passing verification; every failure and
every guard violation routes the money back to the paying wallet as `REFUNDED`.

```mermaid
stateDiagram-v2
    [*] --> AWAITING_PAYMENT: POST /api/tasks (402 + x402 offer)
    AWAITING_PAYMENT --> LOCKED: PAY — X-PAYMENT verified
    LOCKED --> RELEASED: VERIFY passed → settle to provider
    LOCKED --> REFUNDED: VERIFY failed → refund paying wallet
    RELEASED --> [*]
    REFUNDED --> [*]
```

Escrow only locks once a payment authorization is verified (signature, amount,
offer match, expiry, and nonce replay all checked), and it can only settle once —
`produce` and `verify` are rejected until the escrow is `LOCKED`, and a settled
transaction cannot be settled again.

## Why x402

[x402](https://x402.org) is an open protocol that puts payments directly on the
HTTP request path using the long-reserved `402 Payment Required` status code. A
server answers a request with `402` plus machine-readable payment requirements;
the client pays (a stablecoin micropayment, e.g. USDC on Base) and retries with
an `X-PAYMENT` header; a **facilitator** verifies and settles the payment.

That gives TokenPact exactly the rail it needs:

- **No accounts, cards, or invoices** — agents pay per request, in cents.
- **No human in the loop** — settlement is programmatic.
- **A natural place to gate** — the same 402 handshake that funds escrow can be
  reused as a metered *tollbooth* for any expensive API (see the roadmap).

TokenPact adds the missing half: instead of settling on the spot, it holds the
payment in escrow and settles the x402 payment **conditionally**, after the
verifier signs off.

## Settlement: prototype vs. planned

| Concern | Prototype (today) | Planned |
| --- | --- | --- |
| Escrow custody | Orchestrator-controlled escrow account + in-memory/SQLite ledger | On-chain escrow contract |
| Settlement trigger | Orchestrator calls x402 release/refund after a signed verdict | Contract releases on a signed verifier attestation |
| Verifier trust | Single verifier, signature-checked | Multiple independent verifiers / staking |
| Transaction log | Local SQLite | On-chain event log + indexer |

## Second surface: the tollbooth

The same escrow-metering-settlement primitives can gate access to an expensive
downstream API: charge per call, settle x402 micropayments automatically, track
usage, and enforce per-agent budgets. Same machinery, a different gate — one
payment layer serving two agent economies.
