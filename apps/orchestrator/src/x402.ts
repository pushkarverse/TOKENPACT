

import { randomUUID, createHash } from "node:crypto";
import type { X402Offer } from "@tokenpact/core";

const PROVIDER_ADDRESS = "0xPR0V…dEr7";
const BUYER_ADDRESS = "0xBuY3r…f00d";
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

export function settlementHash(seed: string): string {
  return "0x" + createHash("sha256").update(seed + ":" + Date.now()).digest("hex").slice(0, 40);
}

export const ADDRESSES = { provider: PROVIDER_ADDRESS, buyer: BUYER_ADDRESS };
