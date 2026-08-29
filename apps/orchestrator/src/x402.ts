

import {
  createWallet,
  createOffer,
  buildPayment,
  verifyPayment,
  decodePaymentHeader,
  settle,
  type Wallet,
  type X402Offer,
  type PaymentPayload,
  type SettlementReceipt,
} from "@tokenpact/core";

const escrow: Wallet = createWallet("tokenpact.escrow");

const providerWallet: Wallet = createWallet("provider.payout");
const PROVIDER_ADDRESS = providerWallet.address;

const demoBuyer: Wallet = createWallet("buyer.demo.agent");

export const ADDRESSES = {
  escrow: escrow.address,
  provider: PROVIDER_ADDRESS,
  buyer: demoBuyer.address,
};

export function makeOffer(resource: string, amountCents: number): X402Offer {
  return createOffer({ amountCents, payTo: escrow.address, resource });
}

export function simulateBuyerPayment(offer: X402Offer): PaymentPayload {
  return buildPayment(offer, demoBuyer);
}

export type IncomingPayment =
  | { ok: true; payment: PaymentPayload }
  | { ok: false; reason: string };

export function verifyIncomingPayment(
  offer: X402Offer,
  source: string | PaymentPayload | null,
): IncomingPayment {
  let payment: PaymentPayload | null;
  if (source == null) {
    payment = simulateBuyerPayment(offer);
  } else if (typeof source === "string") {
    payment = decodePaymentHeader(source);
    if (!payment) return { ok: false, reason: "malformed X-PAYMENT header" };
  } else {
    payment = source;
  }
  const check = verifyPayment(offer, payment);
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, payment };
}

export function settleTransaction(params: {
  paymentId: string;
  amountCents: number;
  asset: string;
  network: string;
  buyerAddress: string; 
  passed: boolean;
  reason: string;
}): SettlementReceipt {
  return settle({
    paymentId: params.paymentId,
    amountCents: params.amountCents,
    escrowAddress: escrow.address,
    providerAddress: PROVIDER_ADDRESS,
    buyerAddress: params.buyerAddress,
    asset: params.asset,
    network: params.network,
    passed: params.passed,
    reason: params.reason,
  });
}
