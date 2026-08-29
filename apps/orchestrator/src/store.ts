import type { Transaction, ProviderScenario, Balances, PaymentPayload } from "@tokenpact/core";
import { buildSpec, produce } from "@tokenpact/core";
import { verify } from "@tokenpact/verifier";
import { makeOffer, verifyIncomingPayment, settleTransaction, ADDRESSES } from "./x402.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(__dirname, "../../../ledger.json");

let transactions: Transaction[] = [];
let usedPaymentIds = new Set<string>();
let balances: Balances = { escrowHeld: 0, providerEarned: 0, buyerRefunded: 0, grossVolume: 0 };
let counter = 1041;
let tollboothCount = 0;
let tollboothVolume = 0;

function loadLedger() {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      const data = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8"));
      transactions = data.transactions || [];
      balances = data.balances || { escrowHeld: 0, providerEarned: 0, buyerRefunded: 0, grossVolume: 0 };
      counter = data.counter || 1041;
      tollboothCount = data.tollboothCount || 0;
      tollboothVolume = data.tollboothVolume || 0;
      usedPaymentIds = new Set(data.usedPaymentIds || []);
    }
  } catch (err) {
    console.error("Failed to load ledger DB:", err);
  }
}

function saveLedger() {
  try {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify({
      transactions,
      balances,
      counter,
      tollboothCount,
      tollboothVolume,
      usedPaymentIds: Array.from(usedPaymentIds)
    }, null, 2));
  } catch (err) {
    console.error("Failed to save ledger DB:", err);
  }
}
loadLedger();

export function resetLedger() {
  transactions = [];
  usedPaymentIds.clear();
  balances = { escrowHeld: 0, providerEarned: 0, buyerRefunded: 0, grossVolume: 0 };
  counter = 1041;
  tollboothCount = 0;
  tollboothVolume = 0;
  if (fs.existsSync(LEDGER_PATH)) {
    fs.unlinkSync(LEDGER_PATH);
  }
}

export function createTask(): Transaction {
  const spec = buildSpec();
  const id = `TP-${++counter}`;
  const offer = makeOffer(`/api/tasks/${id}`, spec.priceCents);
  const tx: Transaction = {
    id,
    spec,
    provider: null,
    offer,
    payment: null,
    escrow: "AWAITING_PAYMENT",
    verification: null,
    receipt: null,
    amountCents: spec.priceCents,
    settlementTx: null,
    payoutTo: null,
    createdAt: Date.now(),
    fundedAt: null,
    settledAt: null,
  };
  transactions.unshift(tx);
  saveLedger();
  return tx;
}

export function fundEscrow(txId: string, source: string | PaymentPayload | null = null): Transaction {
  const tx = getTx(txId);
  if (!tx) throw new Error(`unknown transaction ${txId}`);
  if (!tx.offer) throw new Error(`transaction ${txId} has no offer`);
  if (tx.escrow !== "AWAITING_PAYMENT") {
    throw new Error(`transaction ${txId} is not awaiting payment (state: ${tx.escrow})`);
  }

  const result = verifyIncomingPayment(tx.offer, source);
  if (!result.ok) throw new Error(`payment rejected: ${result.reason}`);
  if (usedPaymentIds.has(result.payment.paymentId)) {
    throw new Error("payment rejected: paymentId already used (replay)");
  }

  usedPaymentIds.add(result.payment.paymentId);
  tx.payment = result.payment;
  tx.escrow = "LOCKED";
  tx.fundedAt = Date.now();
  balances.escrowHeld += tx.amountCents;
  balances.grossVolume += tx.amountCents;
  saveLedger();
  return tx;
}

export function attachProvider(txId: string, scenario: ProviderScenario): Transaction {
  const tx = getTx(txId);
  if (!tx) throw new Error(`unknown transaction ${txId}`);
  if (tx.escrow === "AWAITING_PAYMENT") {
    throw new Error(`transaction ${txId} is not funded yet — pay the x402 offer first`);
  }
  if (tx.escrow !== "LOCKED") throw new Error(`transaction ${txId} is already settled`);
  tx.provider = produce(scenario);
  saveLedger();
  return tx;
}

export async function runVerification(txId: string): Promise<Transaction> {
  const tx = getTx(txId);
  if (!tx) throw new Error(`unknown transaction ${txId}`);
  if (!tx.payment || !tx.offer) throw new Error(`transaction ${txId} is not funded — pay the x402 offer first`);
  if (tx.escrow !== "LOCKED") throw new Error(`transaction ${txId} is already settled`);
  if (!tx.provider) throw new Error(`transaction ${txId} has no provider output yet`);

  const result = await verify(tx.spec, tx.provider);
  tx.verification = result;

  const receipt = settleTransaction({
    paymentId: tx.payment.paymentId,
    amountCents: tx.amountCents,
    asset: tx.offer.asset,
    network: tx.offer.network,
    buyerAddress: tx.payment.authorization.from,
    passed: result.passed,
    reason: result.passed ? "verification passed" : "verification failed",
  });

  tx.escrow = result.passed ? "RELEASED" : "REFUNDED";
  tx.payoutTo = receipt.direction;
  tx.receipt = receipt;
  tx.settlementTx = receipt.settlementTx;
  tx.settledAt = receipt.settledAt;

  balances.escrowHeld -= tx.amountCents;
  if (result.passed) balances.providerEarned += tx.amountCents;
  else balances.buyerRefunded += tx.amountCents;

  saveLedger();
  return tx;
}

export function getTx(id: string): Transaction | undefined {
  return transactions.find((t) => t.id === id);
}

export function getLedger(limit = 25): Transaction[] {
  return transactions.slice(0, limit);
}

export function getBalances(): Balances {
  return { ...balances };
}

export function stats() {
  const settled = transactions.filter((t) => t.escrow === "RELEASED" || t.escrow === "REFUNDED");
  const released = settled.filter((t) => t.escrow === "RELEASED");
  const refunded = settled.filter((t) => t.escrow === "REFUNDED");
  const awaiting = transactions.filter((t) => t.escrow === "AWAITING_PAYMENT").length;
  const locked = transactions.filter((t) => t.escrow === "LOCKED").length;
  return {
    settled: settled.length + tollboothCount,
    released: released.length,
    refunded: refunded.length,
    awaiting,
    locked,

    escrowHeld: balances.escrowHeld,
    providerEarned: balances.providerEarned + tollboothVolume,
    buyerRefunded: balances.buyerRefunded,
    grossVolume: balances.grossVolume + tollboothVolume,

    releasedCents: balances.providerEarned,
    protectedCents: balances.buyerRefunded,
    tollbooth: { count: tollboothCount, volumeCents: tollboothVolume },
  };
}

export function processTollboothPayment(source: string | PaymentPayload | null) {
  const offer = makeOffer("/api/tollbooth", 1);

  const result = verifyIncomingPayment(offer, source);
  if (!result.ok) throw new Error(`payment rejected: ${result.reason}`);
  if (usedPaymentIds.has(result.payment.paymentId)) {
    throw new Error("payment rejected: paymentId already used (replay)");
  }

  usedPaymentIds.add(result.payment.paymentId);
  tollboothVolume += offer.amountCents;
  tollboothCount += 1;
  saveLedger();

  return {
    payment: result.payment,
    offer,
    data: {
      message: "Success! Expensive API logic executed.",
      model_tokens: 154,
      rate_limit_remaining: 999
    }
  };
}

export { ADDRESSES };
