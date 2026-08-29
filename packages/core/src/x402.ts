

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  randomBytes,
  createHash,
} from "node:crypto";
import type {
  X402Offer,
  PaymentAuthorization,
  PaymentPayload,
  SettlementReceipt,
} from "./types.js";

export const X402_VERSION = 1;

const DEFAULT_ASSET = "USDC";
const DEFAULT_NETWORK = "base-sepolia (simulated)";
const DEFAULT_TTL_MS = 5 * 60_000;

export type Wallet = {
  label: string;
  address: string;
  publicKey: string;
  privateKey: string;
};

export type PaymentCheck = { ok: true } | { ok: false; reason: string };

export function createWallet(label = "wallet"): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { label, address: addressOf(publicKey), publicKey, privateKey };
}

export function addressOf(publicKeyPem: string): string {
  return "0x" + createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 40);
}

function authMessage(a: PaymentAuthorization): string {
  return [a.from, a.to, a.valueCents, a.asset, a.network, a.nonce, a.validAfter, a.validBefore].join("|");
}

function signAuthorization(auth: PaymentAuthorization, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return edSign(null, Buffer.from(authMessage(auth)), key).toString("base64");
}

function verifyAuthorization(auth: PaymentAuthorization, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return edVerify(null, Buffer.from(authMessage(auth)), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function createOffer(params: {
  amountCents: number;
  payTo: string;
  resource: string;
  asset?: string;
  network?: string;
  description?: string;
  ttlMs?: number;
}): X402Offer {
  return {
    status: 402,
    x402Version: X402_VERSION,
    paymentId: "pay_" + randomBytes(8).toString("hex"),
    scheme: "exact",
    amountCents: params.amountCents,
    asset: params.asset ?? DEFAULT_ASSET,
    network: params.network ?? DEFAULT_NETWORK,
    payTo: params.payTo,
    nonce: randomBytes(8).toString("hex"),
    resource: params.resource,
    description: params.description ?? "Quality-gated escrow payment",
    validUntil: Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS),
  };
}

export function buildPayment(offer: X402Offer, wallet: Wallet): PaymentPayload {
  const authorization: PaymentAuthorization = {
    from: wallet.address,
    to: offer.payTo,
    valueCents: offer.amountCents,
    asset: offer.asset,
    network: offer.network,
    nonce: offer.nonce,
    validAfter: Date.now(),
    validBefore: offer.validUntil,
  };
  return {
    x402Version: offer.x402Version,
    paymentId: offer.paymentId,
    scheme: "exact",
    network: offer.network,
    authorization,
    publicKey: wallet.publicKey,
    signature: signAuthorization(authorization, wallet.privateKey),
  };
}

export function encodePaymentHeader(payment: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payment), "utf8").toString("base64");
}

export function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentPayload;
  } catch {
    return null;
  }
}

function fail(reason: string): PaymentCheck {
  return { ok: false, reason };
}

export function verifyPayment(offer: X402Offer, payment: PaymentPayload, now: number = Date.now()): PaymentCheck {
  if (payment.paymentId !== offer.paymentId) return fail("paymentId does not match the offer");
  if (payment.scheme !== "exact" || offer.scheme !== "exact") return fail("unsupported payment scheme");
  if (payment.network !== offer.network) return fail("payment is on the wrong network");

  const a = payment.authorization;
  if (!a) return fail("missing payment authorization");
  if (a.to !== offer.payTo) return fail("authorization pays the wrong address");
  if (a.asset !== offer.asset) return fail(`wrong asset (offer requires ${offer.asset})`);
  if (a.network !== offer.network) return fail("authorization is on the wrong network");
  if (a.nonce !== offer.nonce) return fail("nonce does not match the offer");
  if (a.valueCents !== offer.amountCents) {
    return fail(`exact-amount mismatch: offer needs ${offer.amountCents}, payment authorizes ${a.valueCents}`);
  }
  if (now < a.validAfter) return fail("payment is not valid yet");
  if (now > a.validBefore) return fail("payment authorization has expired");
  if (now > offer.validUntil) return fail("offer has expired");
  if (addressOf(payment.publicKey) !== a.from) return fail("public key does not match the payer address");
  if (!verifyAuthorization(a, payment.signature, payment.publicKey)) return fail("invalid payment signature");

  return { ok: true };
}

export function txHash(seed: string): string {
  return "0x" + createHash("sha256").update(seed).digest("hex").slice(0, 40);
}

export function settle(params: {
  paymentId: string;
  amountCents: number;
  escrowAddress: string;
  providerAddress: string;
  buyerAddress: string;
  asset: string;
  network: string;
  passed: boolean;
  reason: string;
  now?: number;
}): SettlementReceipt {
  const now = params.now ?? Date.now();
  const direction: "provider" | "buyer" = params.passed ? "provider" : "buyer";
  const to = params.passed ? params.providerAddress : params.buyerAddress;
  return {
    settlementTx: txHash(`${params.paymentId}:${direction}:${now}:${randomBytes(6).toString("hex")}`),
    network: params.network,
    direction,
    amountCents: params.amountCents,
    from: params.escrowAddress,
    to,
    asset: params.asset,
    reason: params.reason,
    settledAt: now,
  };
}
