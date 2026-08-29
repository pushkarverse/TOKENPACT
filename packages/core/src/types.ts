export type Money = { cents: number };

export type EscrowState = "AWAITING_PAYMENT" | "LOCKED" | "RELEASED" | "REFUNDED";

export type CheckStatus = "pending" | "pass" | "fail";

export type Check = {
  id: "compiles" | "tests" | "latency" | "schema";
  label: string;
  detail: string;
  status: CheckStatus;
};

export type AcceptIf = {
  compiles: boolean;
  testsMustAllPass: boolean;
  p95BudgetMs: number;
  schema: string;
  humanExpr: string;
};

export type TestCase = { input: string; expected: string };

export type TaskSpec = {
  id: string;
  title: string;
  task: string;
  language?: string;
  tests: TestCase[];
  acceptIf: AcceptIf;
  priceCents: number;
  createdAt: number;
};

export type ProviderScenario = "honest" | "faulty" | "slow";

export type ProviderOutput = {
  provider: string;
  scenario: ProviderScenario;
  language: string;
  headline: string;
  code: string;
  commitHash: string;
  producedAt: number;
};
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
  signature: string;
  ranAt: number;
  durationMs: number;
};

export type X402Offer = {
  status: 402;
  x402Version: number;
  paymentId: string;
  scheme: "exact";
  amountCents: number;
  asset: string;
  network: string;
  payTo: string;
  nonce: string;
  resource: string;
  description: string;
  validUntil: number;
};

export type PaymentAuthorization = {
  from: string;
  to: string;
  valueCents: number;
  asset: string;
  network: string;
  nonce: string;
  validAfter: number;
  validBefore: number;
};

export type PaymentPayload = {
  x402Version: number;
  paymentId: string;
  scheme: "exact";
  network: string;
  authorization: PaymentAuthorization;
  publicKey: string;
  signature: string;
};

export type SettlementReceipt = {
  settlementTx: string;
  network: string;
  direction: "provider" | "buyer";
  amountCents: number;
  from: string;
  to: string;
  asset: string;
  reason: string;
  settledAt: number;
};

export type Balances = {
  escrowHeld: number;
  providerEarned: number;
  buyerRefunded: number;
  grossVolume: number;
};

export type Transaction = {
  id: string;
  spec: TaskSpec;
  provider: ProviderOutput | null;
  offer: X402Offer | null;
  payment: PaymentPayload | null;
  escrow: EscrowState;
  verification: VerificationResult | null;
  receipt: SettlementReceipt | null;
  amountCents: number;
  settlementTx: string | null;
  payoutTo: "provider" | "buyer" | null;
  createdAt: number;
  fundedAt: number | null;
  settledAt: number | null;
};
