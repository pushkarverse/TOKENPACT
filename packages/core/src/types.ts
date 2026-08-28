// TokenPact — shared domain types.
// One vocabulary used by the buyer agent, the provider agent, the verifier,
// and the settlement layer, so every plane of the system speaks the same language.

/** A quantity of money, always stored in integer cents to avoid float drift. */
export type Money = { cents: number };

/** Escrow lifecycle. Funds are LOCKED at task creation and end RELEASED or REFUNDED. */
export type EscrowState = "LOCKED" | "RELEASED" | "REFUNDED";

export type CheckStatus = "pending" | "pass" | "fail";

/** One line in the verifier's receipt. */
export type Check = {
  id: "compiles" | "tests" | "latency" | "schema";
  label: string;
  detail: string;
  status: CheckStatus;
};

/** The machine-checkable acceptance condition — the deck's `accept_if`. */
export type AcceptIf = {
  compiles: boolean;
  testsMustAllPass: boolean;
  p95BudgetMs: number;
  schema: string; // expected typeof the return value, e.g. "boolean"
  humanExpr: string; // e.g. "compiles && tests_pass && p95 < 50ms && schema_match"
};

export type TestCase = { input: unknown[]; expected: unknown };

/** The task + quality spec authored by the buyer agent. */
export type TaskSpec = {
  id: string;
  title: string;
  task: string; // natural-language instruction
  fn: string; // required function name, e.g. "isPrime"
  language: "javascript";
  tests: TestCase[];
  latencyProbe: { input: unknown[]; iterations: number };
  acceptIf: AcceptIf;
  priceCents: number;
  createdAt: number;
};

export type ProviderScenario = "honest" | "faulty" | "slow";

/** What a provider agent returns: an implementation plus signed provenance. */
export type ProviderOutput = {
  provider: string;
  scenario: ProviderScenario;
  headline: string; // one-line description of this provider's behaviour
  code: string; // the implementation source
  commitHash: string;
  producedAt: number;
};

/** The verifier's signed verdict over a provider's output. */
export type VerificationResult = {
  checks: Check[];
  compiled: boolean;
  testsPassed: number;
  testsTotal: number;
  p95Ms: number | null;
  p95BudgetMs: number;
  schemaExpected: string;
  schemaGot: string;
  schemaMatch: boolean;
  timedOut: boolean;
  passed: boolean;
  verifier: string;
  signature: string; // verifier signs the result; it is never paid by the provider
  ranAt: number;
  durationMs: number;
};

/** An x402-style "402 Payment Required" offer (simulated rail). */
export type X402Offer = {
  status: 402;
  paymentId: string;
  scheme: "exact";
  amountCents: number;
  asset: string; // "USDC"
  network: string; // "base-sepolia (simulated)"
  payTo: string;
  nonce: string;
  description: string;
};

/** A single reverse-escrow transaction, from task creation through settlement. */
export type Transaction = {
  id: string; // "TP-1042"
  spec: TaskSpec;
  provider: ProviderOutput | null;
  offer: X402Offer | null;
  escrow: EscrowState;
  verification: VerificationResult | null;
  amountCents: number;
  settlementTx: string | null;
  payoutTo: "provider" | "buyer" | null;
  createdAt: number;
  settledAt: number | null;
};
