
import {
  createWallet,
  buildPayment,
  encodePaymentHeader,
  centsToUsd,
  type X402Offer,
  type Transaction,
  type Wallet,
} from "@tokenpact/core";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL ?? "http://localhost:8402";

function loadBuyerWallet(): Wallet {
  return createWallet("buyer.agent");
}

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main() {
  console.log(`${BLUE}${BOLD}
  ██████╗ ██████╗ ██╗██████╗  ██████╗ 
  ██╔══██╗██╔══██╗██║██╔══██╗██╔═══██╗
  ██████╔╝██████╔╝██║██║  ██║██║   ██║
  ██╔═══╝ ██╔══██╗██║██║  ██║██║   ██║
  ██║     ██║  ██║██║██████╔╝╚██████╔╝
  ╚═╝     ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ 
  [ INTENT PLANE · BUYER AGENT ]${RESET}\n`);

  const buyer = loadBuyerWallet();
  console.log(`${DIM}▶${RESET} Loaded Wallet: ${YELLOW}${buyer.address}${RESET}`);

  let created;
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      created = await fetch(`${ORCHESTRATOR}/api/tasks`, { method: "POST" });
      break;
    } catch (e) {
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (!created || created.status !== 402) {
    throw new Error(`expected 402 Payment Required, got ${created ? created.status : 'connection refused'}`);
  }
  const gate = (await created.json()) as { offer: X402Offer; transaction: Transaction };
  const offer = gate.offer;
  const taskId = gate.transaction.id;
  console.log(`${GREEN}✔${RESET} Task Created: ${BOLD}${taskId}${RESET} — spec "${gate.transaction.spec.title}"`);
  console.log(`${DIM}▶${RESET} Escrow Offer: ${YELLOW}${centsToUsd(offer.amountCents)} ${offer.asset}${RESET} on ${offer.network} → ${offer.payTo}`);

  const payment = buildPayment(offer, buyer);
  const paid = await fetch(`${ORCHESTRATOR}/api/tasks/${taskId}/pay`, {
    method: "POST",
    headers: { "x-payment": encodePaymentHeader(payment) },
  });
  if (!paid.ok) {
    const err = (await paid.json()) as { error?: string };
    throw new Error(`payment rejected (${paid.status}): ${err.error ?? "unknown"}`);
  }
  const receiptHeader = paid.headers.get("x-payment-response");
  if (receiptHeader) {
    const r = JSON.parse(Buffer.from(receiptHeader, "base64").toString("utf8"));
    console.log(`${GREEN}✔${RESET} Paid Offer: escrow ${r.escrow}, settlement ${r.txId} on ${r.network}`);
  }
  console.log(`\n${BLUE}ℹ${RESET} Escrow ${BOLD}LOCKED${RESET}. Waiting for a provider + verifier to settle ${taskId}…\n`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(`${ORCHESTRATOR}/api/tasks/${taskId}`);
    if (!res.ok) continue;
    const { transaction: tx } = (await res.json()) as { transaction: Transaction };
    if (tx.escrow === "RELEASED" || tx.escrow === "REFUNDED") {
      report(tx);
      return;
    }
  }
  console.log(`[buyer]  timed out waiting for ${taskId} to settle`);
  process.exit(1);
}

function report(tx: Transaction) {
  const v = tx.verification;
  console.log(`\n${BLUE}=======================================${RESET}`);
  console.log(`${BOLD}SETTLEMENT REPORT: ${tx.id}${RESET}`);
  console.log(`${BLUE}=======================================${RESET}`);
  if (v) {
    for (const c of v.checks) {
      const mark = c.status === "pass" ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  [${mark}] ${c.label.padEnd(22)} ${c.detail}`);
    }
  }
  console.log();
  if (tx.escrow === "RELEASED") {
    console.log(`${GREEN}✔ Work Verified!${RESET} ${YELLOW}${centsToUsd(tx.amountCents)}${RESET} released to ${tx.receipt?.to}.`);
  } else {
    console.log(`${RED}✗ Verification Failed!${RESET} ${YELLOW}${centsToUsd(tx.amountCents)}${RESET} refunded to ${tx.receipt?.to}. Paid $0 for bad work.`);
  }
  if (tx.receipt) console.log(`${DIM}Settlement TX Hash: ${tx.receipt.settlementTx}${RESET}`);
}

main().catch((err) => {
  console.error(`[buyer]  ${err && err.message ? err.message : err}`);
  console.error(`[buyer]  is the orchestrator running?  (pnpm demo:server)`);
  process.exit(1);
});
