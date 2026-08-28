// The demo catalog: one task spec authored by the buyer agent, and three
// provider agents that respond to it with different behaviour. The verifier
// runs the *real* code of whichever provider is chosen.
//
// Task: implement isPrime(n). Acceptance is machine-checkable:
//   compiles && all tests pass && p95 latency < 50ms && returns a boolean.

import type { TaskSpec, ProviderScenario, ProviderOutput } from "./types.ts";
import { createHash } from "node:crypto";

// A large prime used only to measure latency. A √n implementation clears it in
// microseconds; a naive O(n) implementation must loop ~10^8 times and blows the
// budget. Primality matters: on a composite the naive loop would exit early.
const LATENCY_PROBE = 100_000_007; // verified prime

export function buildSpec(): TaskSpec {
  const tests: { input: unknown[]; expected: unknown }[] = [
    { input: [1], expected: false },
    { input: [2], expected: true },
    { input: [3], expected: true },
    { input: [4], expected: false },
    { input: [9], expected: false },
    { input: [11], expected: true },
    { input: [15], expected: false },
    { input: [17], expected: true },
    { input: [25], expected: false },
    { input: [29], expected: true },
    { input: [97], expected: true },
    { input: [100], expected: false },
  ];

  return {
    id: "spec_isprime_v1",
    title: "Primality check",
    task: "Implement isPrime(n): return true iff n is a prime number.",
    fn: "isPrime",
    language: "javascript",
    tests,
    latencyProbe: { input: [LATENCY_PROBE], iterations: 60 },
    acceptIf: {
      compiles: true,
      testsMustAllPass: true,
      p95BudgetMs: 50,
      schema: "boolean",
      humanExpr: "compiles && tests_pass && p95 < 50ms && schema_match",
    },
    priceCents: 8, // $0.08, echoing the deck
    createdAt: Date.now(),
  };
}

// --- Provider implementations (real code the verifier will execute) ---------

const HONEST = `
function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}
`.trim();

// A believable bug: "assume every odd number is prime." Fast, returns a
// boolean, but wrong on 1, 2, 9, 15, 25 → 7 / 12 tests pass.
const FAULTY = `
function isPrime(n) {
  // shortcut: odd numbers are prime
  return n % 2 === 1;
}
`.trim();

// Correct on every test, but O(n): it clears the unit tests (all small) and
// then blows the latency budget on the probe input.
const SLOW = `
function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let i = 2; i < n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}
`.trim();

const IMPLS: Record<ProviderScenario, { headline: string; code: string; provider: string }> = {
  honest: {
    provider: "provider.honest.agent",
    headline: "√n trial division — correct and fast",
    code: HONEST,
  },
  faulty: {
    provider: "provider.faulty.agent",
    headline: "Assumes every odd number is prime",
    code: FAULTY,
  },
  slow: {
    provider: "provider.slow.agent",
    headline: "Correct, but O(n) — misses the latency budget",
    code: SLOW,
  },
};

export function produce(scenario: ProviderScenario): ProviderOutput {
  const impl = IMPLS[scenario];
  const commitHash = createHash("sha256").update(impl.code).digest("hex").slice(0, 12);
  return {
    provider: impl.provider,
    scenario,
    headline: impl.headline,
    code: impl.code,
    commitHash,
    producedAt: Date.now(),
  };
}

export const SCENARIOS: ProviderScenario[] = ["honest", "faulty", "slow"];

/** Lightweight catalog the dashboard uses to render the three provider options. */
export const SCENARIO_META: { id: ProviderScenario; name: string; headline: string }[] = [
  { id: "honest", name: "Honest", headline: IMPLS.honest.headline },
  { id: "faulty", name: "Faulty", headline: IMPLS.faulty.headline },
  { id: "slow", name: "Slow", headline: IMPLS.slow.headline },
];
