import type { TaskSpec, ProviderScenario, ProviderOutput } from "./types.js";
import { createHash } from "node:crypto";

export function buildSpec(): TaskSpec {
  const tests = [
    { input: "0\n", expected: "0\n" },
    { input: "1\n", expected: "1\n" },
    { input: "5\n", expected: "5\n" },
    { input: "10\n", expected: "55\n" },
    { input: "15\n", expected: "610\n" },
  ];

  return {
    id: "spec_fibonacci_v1",
    title: "Fibonacci Sequence (Algorithm)",
    task: "Write a program that reads an integer from stdin and prints the corresponding Fibonacci number to stdout.",
    language: "python",
    tests,
    acceptIf: {
      compiles: true,
      testsMustAllPass: true,
      p95BudgetMs: 500, 
      schema: "string", 
      humanExpr: "compiles && tests_pass && p95 < 500ms && schema_match",
    },
    priceCents: 8,
    createdAt: Date.now(),
  };
}

const HONEST = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim().split('\\n');

function fib(n) {
  let a = 0n, b = 1n;
  for (let i = 0; i < n; i++) {
    let t = a + b;
    a = b;
    b = t;
  }
  return a.toString();
}

for (const line of input) {
  if (!line.trim()) continue;
  console.log(fib(parseInt(line, 10)));
}
`.trim();

const FAULTY = `
import sys

def fibonacci(n):
    if n == 0:
        return 0
    return n + 1

if __name__ == '__main__':
    for line in sys.stdin:
        n = int(line.strip())
        print(fibonacci(n))
`.trim();

const SLOW = `
#!/bin/bash
sleep 0.6
while read n; do
  if [ -z "$n" ]; then continue; fi
  # Doing this in bash recursively would time out completely, so we just return fake
  # or iterative, but we already slept so it will fail latency check anyway.
  # Let's output correct values using a basic loop so it ONLY fails latency.
  a=0
  b=1
  for (( i=0; i<n; i++ )); do
    t=$((a + b))
    a=$b
    b=$t
  done
  echo $a
done
`.trim();

const IMPLS: Record<ProviderScenario, { headline: string; code: string; provider: string; language: string }> = {
  honest: {
    provider: "provider.honest.agent",
    headline: "Iterative O(n) JS — correct and fast",
    code: HONEST,
    language: "javascript",
  },
  faulty: {
    provider: "provider.faulty.agent",
    headline: "Faulty Python — Assumes fib(n) = n + 1",
    code: FAULTY,
    language: "python",
  },
  slow: {
    provider: "provider.slow.agent",
    headline: "Slow Bash — Fails the latency budget",
    code: SLOW,
    language: "bash",
  },
};

export function produce(scenario: ProviderScenario): ProviderOutput {
  const impl = IMPLS[scenario];
  const commitHash = createHash("sha256").update(impl.code).digest("hex").slice(0, 12);
  return {
    provider: impl.provider,
    scenario,
    headline: impl.headline,
    language: impl.language,
    code: impl.code,
    commitHash,
    producedAt: Date.now(),
  };
}

export const SCENARIOS: ProviderScenario[] = ["honest", "faulty", "slow"];

export const SCENARIO_META: { id: ProviderScenario; name: string; headline: string }[] = [
  { id: "honest", name: "Honest", headline: IMPLS.honest.headline },
  { id: "faulty", name: "Faulty", headline: IMPLS.faulty.headline },
  { id: "slow", name: "Slow", headline: IMPLS.slow.headline },
];
