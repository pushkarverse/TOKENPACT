

import {
  createTask,
  fundEscrow,
  attachProvider,
  runVerification,
  getBalances,
} from "../src/store.js";
import {
  createWallet,
  createOffer,
  buildPayment,
  verifyPayment,
  centsToUsd,
  type ProviderScenario,
} from "@tokenpact/core";

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

function throws(label: string, fn: () => unknown, expectMatch?: string) {
  try {
    fn();
    failed++;
    console.log(`  ✗ ${label}  — expected it to throw, but it did not`);
  } catch (err: any) {
    const msg = String(err && err.message ? err.message : err);
    if (expectMatch && !msg.includes(expectMatch)) {
      failed++;
      console.log(`  ✗ ${label}  — threw "${msg}", expected to include "${expectMatch}"`);
    } else {
      passed++;
      console.log(`  ✓ ${label}`);
    }
  }
}

;(async () => {
console.log("\n· x402 payment integrity");
{
  const escrow = createWallet("test.escrow");
  const buyer = createWallet("test.buyer");
  const offer = createOffer({ amountCents: 8, payTo: escrow.address, resource: "/api/tasks/TEST" });
  const payment = buildPayment(offer, buyer);

  ok("a well-formed signed payment verifies", verifyPayment(offer, payment).ok);

  const wrongAmount = { ...payment, authorization: { ...payment.authorization, valueCents: 9 } };
  ok("an altered amount is rejected", !verifyPayment(offer, wrongAmount).ok);

  const flip = payment.signature[0] === "A" ? "B" : "A";
  const badSig = { ...payment, signature: flip + payment.signature.slice(1) };
  ok("a tampered signature is rejected", !verifyPayment(offer, badSig).ok);

  const otherOffer = createOffer({ amountCents: 8, payTo: escrow.address, resource: "/api/tasks/OTHER" });
  ok("a payment for a different offer is rejected", !verifyPayment(otherOffer, payment).ok);

  const shortLived = createOffer({ amountCents: 8, payTo: escrow.address, resource: "/x", ttlMs: 1 });
  const p2 = buildPayment(shortLived, buyer);
  ok("an expired offer is rejected", !verifyPayment(shortLived, p2, Date.now() + 60_000).ok);
}

console.log("\n· escrow lifecycle guards");
{
  const t = createTask();
  ok("a new task is AWAITING_PAYMENT, not locked", t.escrow === "AWAITING_PAYMENT", `was ${t.escrow}`);
  ok("a new task carries an x402 offer", !!t.offer && t.offer.status === 402);
  throws("producing before payment is refused", () => attachProvider(t.id, "honest"), "pay the x402 offer first");
  
  try {
    await runVerification(t.id);
    failed++;
    console.log(`  ✗ verifying before payment is refused  — expected it to throw, but it did not`);
  } catch (err: any) {
    const msg = String(err && err.message ? err.message : err);
    if (!msg.includes("not funded")) {
      failed++;
      console.log(`  ✗ verifying before payment is refused  — threw "${msg}", expected to include "not funded"`);
    } else {
      passed++;
      console.log(`  ✓ verifying before payment is refused`);
    }
  }
}

const cases: { scenario: ProviderScenario; expect: "RELEASED" | "REFUNDED"; who: "provider" | "buyer" }[] = [
  { scenario: "honest", expect: "RELEASED", who: "provider" },
  { scenario: "faulty", expect: "REFUNDED", who: "buyer" },
  { scenario: "slow", expect: "REFUNDED", who: "buyer" },
];

console.log("\\n· pay → produce → verify → settle");
for (const c of cases) {
  const t = createTask();
  const funded = fundEscrow(t.id); 
  ok(`${c.scenario}: payment locks escrow`, funded.escrow === "LOCKED" && funded.fundedAt != null);

  if (c.scenario === "honest") {
    throws("paying an already-funded task is refused", () => fundEscrow(t.id), "not awaiting payment");
  }

  attachProvider(t.id, c.scenario);
  const settled = await runVerification(t.id);
  const v = settled.verification!;
  const detail = `tests ${v.testsPassed}/${v.testsTotal}, p95 ${v.p95Ms ?? "n/a"}ms`;
  ok(`${c.scenario}: settles ${c.expect} (${detail})`, settled.escrow === c.expect, `was ${settled.escrow}`);
  ok(`${c.scenario}: pays the ${c.who}`, settled.receipt?.direction === c.who && settled.payoutTo === c.who);
  ok(`${c.scenario}: settlement receipt has a tx hash`, !!settled.settlementTx && settled.settlementTx.startsWith("0x"));
}

console.log("\n· fund reconciliation");
{
  const b = getBalances();
  ok("gross volume == 3 tasks funded at 8¢", b.grossVolume === 24, `was ${b.grossVolume}`);
  ok("escrow is fully drained after settlement", b.escrowHeld === 0, `held ${b.escrowHeld}`);
  ok("provider earned exactly the honest task (8¢)", b.providerEarned === 8, `was ${b.providerEarned}`);
  ok("buyer refunded exactly the two failures (16¢)", b.buyerRefunded === 16, `was ${b.buyerRefunded}`);
  ok(
    "earned + refunded == gross volume",
    b.providerEarned + b.buyerRefunded === b.grossVolume,
    `${b.providerEarned} + ${b.buyerRefunded} != ${b.grossVolume}`,
  );
  console.log(
    `\n  ledger: gross ${centsToUsd(b.grossVolume)} → provider ${centsToUsd(b.providerEarned)} earned, buyer ${centsToUsd(b.buyerRefunded)} refunded`,
  );
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"}  —  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
})()
