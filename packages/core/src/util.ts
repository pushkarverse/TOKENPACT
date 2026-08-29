
import type { Money } from "./types.js";

export function fmtMoney(m: Money): string {
  return `$${(m.cents / 100).toFixed(2)}`;
}

export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
