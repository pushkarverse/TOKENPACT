// Simulated x402 payment rail.
//
// In production this module is replaced by real x402: the server answers a
// request with HTTP 402 + payment requirements, the buyer agent's wallet pays
// through an x402 facilitator, and settlement clears on-chain (e.g. USDC on
// Base). Here we reproduce the *same state transitions* in memory so the whole
// escrow flow is faithful without needing a wallet or network at demo time.
//
// The only thing TokenPact adds on top of x402 is the gate: the rail fires
// only after an independent verifier confirms the output meets its spec.

import { randomUUID, createHash } from "node:crypto";
import type { X402Offer } from "./types.ts";

const PROVIDER_ADDRESS = "0xPR0V…dEr7"; // stand-in for the provider agent's wallet
const BUYER_ADDRESS = "0xBuY3r…f00d"; // stand-in for the buyer agent's wallet

/** Build the "402 Payment Required" offer the buyer agent commits to escrow. */
export function createOffer(amountCents: number, payTo: string = PROVIDER_ADDRESS): X402Offer {
  return {
    status: 402,
    paymentId: "pay_" + randomUUID().replace(/-/g, "").slice(0, 16),
    scheme: "exact",
    amountCents,
    asset: "USDC",
    network: "base-sepolia (simulated)",
    payTo,
    nonce: randomUUID().slice(0, 8),
    description: "Quality-gated escrow payment",
  };
}

/** Deterministic-looking settlement hash for the ledger (simulated). */
export function settlementHash(seed: string): string {
  return "0x" + createHash("sha256").update(seed + ":" + Date.now()).digest("hex").slice(0, 40);
}

export const ADDRESSES = { provider: PROVIDER_ADDRESS, buyer: BUYER_ADDRESS };
