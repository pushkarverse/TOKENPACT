/**
 * Example BUYER agent.
 *
 * Demonstrates the buyer side of the loop:
 *   1. describe a task and its machine-checkable acceptance conditions,
 *   2. POST it to the orchestrator,
 *   3. pay the reward into escrow over x402 (retrying the 402 with payment),
 *   4. poll until the task settles, and report whether it PASSED.
 *
 * "Today, agents pay first. Trust comes later." — TokenPact flips that:
 * the buyer funds escrow, but the provider is only paid on proof.
 */
import { type TaskSpec } from "@tokenpact/core";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL ?? "http://localhost:8402";

// The Fibonacci task from the pitch deck.
const spec: TaskSpec = {
  id: `fib-${Date.now()}`,
  title: "Fibonacci in Python (well actually JS)",
  task: "Write a Python function fib(n) that returns the n-th Fibonacci number.",
  fn: "fib",
  language: "javascript",
  tests: [{ input: [5], expected: 5 }],
  latencyProbe: { input: [10], iterations: 100 },
  acceptIf: {
    compiles: true,
    testsMustAllPass: true,
    p95BudgetMs: 50,
    schema: "number",
    humanExpr: "compiles && tests_pass && p95 < 50ms && schema_match"
  },
  priceCents: 25,
  createdAt: Date.now()
};

async function main() {
  // TODO(x402): wrap fetch with x402-fetch so a 402 response is automatically
  // retried with a signed payment header funded by BUYER_PRIVATE_KEY.
  //   import { wrapFetchWithPayment } from "x402-fetch";
  //   const pay = wrapFetchWithPayment(fetch, account);
  const res = await fetch(`${ORCHESTRATOR}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec, buyer: process.env.BUYER_ADDRESS ?? "buyer-demo" }),
  });
  const { taskId } = (await res.json()) as { taskId: string };
  console.log(`[buyer] posted task ${taskId}, escrow funded`);

  // Poll for settlement.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const entry = await (await fetch(`${ORCHESTRATOR}/tasks/${taskId}`)).json() as { state: string, record?: { verification?: { results?: any } } };
    if (entry.state === "RELEASED" || entry.state === "REFUNDED") {
      console.log(`[buyer] task ${taskId} settled: ${entry.state}`);
      console.log(entry.record?.verification?.results ?? "(no verification detail)");
      return;
    }
  }
  console.log("[buyer] timed out waiting for settlement");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
