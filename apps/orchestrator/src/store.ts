import type { Transaction, ProviderScenario } from "@tokenpact/core";
import { buildSpec, produce } from "@tokenpact/core";
import { verify } from "@tokenpact/verifier";
import { createOffer, settlementHash, ADDRESSES } from "./x402.js";

const transactions: Transaction[] = [];
let counter = 1041;

export function createTask(): Transaction {
  const spec = buildSpec();
  const offer = createOffer(spec.priceCents, ADDRESSES.provider);
  const tx: Transaction = {
    id: `TP-${++counter}`,
    spec,
    provider: null,
    offer,
    escrow: "LOCKED",
    verification: null,
    amountCents: spec.priceCents,
    settlementTx: null,
    payoutTo: null,
    createdAt: Date.now(),
    settledAt: null,
  };
  transactions.unshift(tx);
  return tx;
}

export function attachProvider(txId: string, scenario: ProviderScenario): Transaction {
  const tx = getTx(txId);
  if (!tx) throw new Error(`unknown transaction ${txId}`);
  if (tx.escrow !== "LOCKED") throw new Error(`transaction ${txId} is already settled`);
  tx.provider = produce(scenario);
  return tx;
}

export function runVerification(txId: string): Transaction {
  const tx = getTx(txId);
  if (!tx) throw new Error(`unknown transaction ${txId}`);
  if (!tx.provider) throw new Error(`transaction ${txId} has no provider output yet`);
  if (tx.escrow !== "LOCKED") throw new Error(`transaction ${txId} is already settled`);

  const result = verify(tx.spec, tx.provider);
  tx.verification = result;

  if (result.passed) {
    tx.escrow = "RELEASED";
    tx.payoutTo = "provider";
  } else {
    tx.escrow = "REFUNDED";
    tx.payoutTo = "buyer";
  }
  tx.settlementTx = settlementHash(tx.id + tx.escrow);
  tx.settledAt = Date.now();
  return tx;
}

export function getTx(id: string): Transaction | undefined {
  return transactions.find((t) => t.id === id);
}

export function getLedger(limit = 25): Transaction[] {
  return transactions.slice(0, limit);
}

export function stats() {
  const settled = transactions.filter((t) => t.escrow !== "LOCKED");
  const released = settled.filter((t) => t.escrow === "RELEASED");
  const refunded = settled.filter((t) => t.escrow === "REFUNDED");
  const releasedCents = released.reduce((s, t) => s + t.amountCents, 0);
  const protectedCents = refunded.reduce((s, t) => s + t.amountCents, 0);
  return {
    settled: settled.length,
    released: released.length,
    refunded: refunded.length,
    releasedCents,
    protectedCents,
  };
}
