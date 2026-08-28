import { type ProviderOutput } from "@tokenpact/core";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL ?? "http://localhost:8402";

const FIB_PY = `def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
`;

async function fulfill(taskId: string): Promise<void> {
  const output: ProviderOutput = {
    provider: process.env.PROVIDER_ADDRESS ?? "provider-demo",
    scenario: "honest",
    headline: "Demo correct fibonacci implementation",
    code: FIB_PY,
    commitHash: "demo-no-vcs",
    producedAt: Date.now(),
  };

  const res = await fetch(`${ORCHESTRATOR}/tasks/${taskId}/output`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(output),
  });
  console.log(`[provider] submitted output for ${taskId}:`, await res.json());
}

const taskId = process.argv[2];
if (!taskId) {
  console.error("usage: provider <taskId>");
  process.exit(1);
}
fulfill(taskId).catch((err) => {
  console.error(err);
  process.exit(1);
});
