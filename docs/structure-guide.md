# TokenPact Architecture & Monorepo Structure
Welcome to the **TokenPact** codebase! TokenPact flips the traditional freelance model: instead of paying upfront and trusting the provider to deliver, buyers lock funds in an escrow contract, and providers are only paid when their code passes an independent sandbox verification.

To support this microservice architecture efficiently, we use a **pnpm Monorepo**. This means multiple applications and shared libraries all live inside one single Git repository, making it extremely easy to share types and configurations without publishing to npm.

---

## 🏗 High-Level Directory Structure

```text
TOKENPACT/
├── .env.example              # Example environment variables
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json              # Root workspace package and scripts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml       # Declares agents/, apps/, packages/ as workspaces
├── README.md                 
├── SECURITY.md
├── tsconfig.base.json        # Shared strict TypeScript config
├── agents/                   # Demo AI clients
│   ├── buyer/                
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts      # Posts tasks and funds escrow
│   └── provider/             
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts      # Solves tasks and submits code
├── apps/                     # Core backend services
│   ├── orchestrator/         
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── public/           # Frontend Demo UI
│   │   │   ├── app.js
│   │   │   ├── index.html
│   │   │   └── styles.css
│   │   ├── scripts/
│   │   │   └── smoke.ts      # E2E test script
│   │   └── src/
│   │       ├── server.ts     # Node http API server + serves the dashboard
│   │       ├── store.ts      # In-memory ledger & state machine
│   │       └── x402.ts       # Payment/Escrow settlement logic
│   └── verifier/             
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── harness.ts    # Compiles, tests, and validates code
│           ├── index.ts      # Exports verification function
│           └── runner.ts     # Spawns the secure sandbox process
├── docs/                     
│   ├── architecture.md
│   ├── structure-guide.md    # This file!
│   └── verification-spec.md
└── packages/                 # Shared libraries
    └── core/                 
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts      # Exports all core domain logic
            ├── scenarios.ts  # Demo task spec + 3 provider impls (honest/faulty/slow)
            ├── types.ts      # Shared TaskSpec/ProviderOutput schemas
            └── util.ts       # Shared hashing utilities
```

---

## 📂 Deep Dive: Folder by Folder Breakdown

### 1. `apps/` (Core Microservices)
These are the heavy lifters. They are designed to run as standalone services in production.

#### `apps/orchestrator/`
**The "Brain" of the operation.** It maintains the ledger, exposes the public HTTP API, and coordinates the payment settlement logic.
*   `src/server.ts`: The main HTTP server, built on Node's built-in `http` (no framework). It answers `POST /api/tasks` with a **`402 Payment Required`** + x402 offer, locks escrow on `POST /api/tasks/:id/pay` (a signed `X-PAYMENT`), and drives execution via `POST /api/tasks/:id/produce` and `POST /api/tasks/:id/verify`. It also serves the dashboard in `public/`.
*   `src/store.ts`: The in-memory ledger database. It maintains a state machine for every task (`LOCKED` → `RELEASED` or `REFUNDED`). In a production environment, this would be replaced by Postgres and a Blockchain Smart Contract.
*   `src/x402.ts`: Implements the `x402` HTTP Status Code (Payment Required) logic. This ensures that no task is processed until the buyer successfully deposits the escrow funds.
*   `public/`: Contains the frontend assets (`index.html`, `styles.css`, `app.js`) for the visual Demo UI.

#### `apps/verifier/`
**The "Judge" and Sandbox.** It has zero direct contact with buyers or providers. The orchestrator calls the verifier internally to run untrusted code.
*   `src/runner.ts`: Creates a temporary filesystem directory, writes the untrusted code to it, and securely spawns the `harness.ts` script in a locked-down child process.
*   `src/harness.ts`: Evaluates the untrusted provider code. It attempts to compile it, loops through all test cases to verify the logic, probes the code for execution latency (e.g., `<50ms`), and ensures the return schema strictly matches the buyer's requirements. It outputs a rigid Pass/Fail JSON response.

---

### 2. `packages/` (Shared Logic)
Code that needs to be shared across multiple apps lives here. This prevents circular dependencies and duplicate code.

#### `packages/core/`
*   **What it does:** Contains all the foundational Typescript interfaces. Because `core` is imported by `apps` and `agents`, everyone in the ecosystem speaks the exact same language. 
*   `src/types.ts`: The absolute source of truth for the system. It defines exactly what a `TaskSpec` is, what a `ProviderOutput` is, and what a `VerificationResult` looks like.
*   `src/scenarios.ts`: The demo catalog — one buyer-authored `isPrime` task spec (12 tests, p95 budget, boolean schema) plus the three provider implementations the verifier actually executes: `honest` (correct √n), `faulty` (assumes every odd number is prime), and `slow` (correct but O(n), misses the latency budget).
*   `src/util.ts`: Helper functions (like SHA-256 hashing) used globally.

---

### 3. `agents/` (The Clients)
These are Node.js CLI scripts simulating AI agents participating in the decentralized marketplace.

#### `agents/buyer/`
**The Consumer.** 
*   `src/index.ts`: Authors a rigid, machine-checkable requirement (the demo: "implement `isPrime(n)`, all tests pass, p95 < 50ms, returns a boolean"). It `POST`s the task, receives the `402` + x402 offer, signs and submits the `X-PAYMENT` to fund escrow, then polls the API until the task settles as `RELEASED` or `REFUNDED`.

#### `agents/provider/`
**The Worker.** 
*   `src/index.ts`: Represents an LLM coding agent. It takes a task (by ID, or by discovering the open one), produces a JavaScript `isPrime` solution for the chosen scenario — `honest` (correct √n), `faulty` (assumes odd = prime), or `slow` (correct but O(n)) — submits it via `produce`, then requests `verify` to attempt to claim the escrow bounty.

---

## ⚙️ The TokenPact Lifecycle (How it all connects)

1. The **Buyer Agent** creates a task requirement using models from `packages/core`.
2. It `POST`s the task, receives a **`402`** with the x402 offer, and funds escrow with a signed `X-PAYMENT`.
3. The **Provider Agent** picks up the task and produces a solution for its scenario.
4. The Orchestrator calls the **in-process Verifier**, which runs the untrusted code in a locked-down child-process sandbox.
5. The **Verifier** compiles it, runs every test, probes p95 latency, and checks the output schema, returning a signed binary Pass/Fail result to the Orchestrator.
6. The **Orchestrator** settles: on PASS the escrow is RELEASED to the Provider; on FAIL it is REFUNDED to the paying wallet. *(Settlement is simulated in this prototype — no funds move on a live chain.)*
