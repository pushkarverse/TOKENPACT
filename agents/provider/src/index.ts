
import type { Transaction, ProviderScenario } from "@tokenpact/core";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL ?? "http://localhost:8402";

function pickScenario(): ProviderScenario {
  const s = (process.env.PROVIDER_SCENARIO ?? process.argv[3] ?? "honest").toLowerCase();
  if (s === "honest" || s === "faulty" || s === "slow") return s;
  throw new Error(`PROVIDER_SCENARIO must be honest | faulty | slow (got "${s}")`);
}

async function discoverOpenTask(): Promise<string | null> {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${ORCHESTRATOR}/api/ledger`);
      if (res.ok) {
        const { ledger } = (await res.json()) as { ledger: Transaction[] };
        const open = ledger.find((t) => t.escrow === "LOCKED" && t.provider == null);
        if (open) return open.id;
      }
    } catch (e) {
      
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main() {
  console.log(`${GREEN}${BOLD}
  ██████╗ ██████╗ ██████╗ ██╗   ██╗
  ██╔══██╗██╔══██╗██╔══██╗██║   ██║
  ██████╔╝██████╔╝██║  ██║██║   ██║
  ██╔═══╝ ██╔══██╗██║  ██║╚██╗ ██╔╝
  ██║     ██║  ██║██████╔╝ ╚████╔╝ 
  ╚═╝     ╚═╝  ╚═╝╚═════╝   ╚═══╝  
  [ EXECUTION PLANE · PROVIDER ]${RESET}\n`);
  const scenario = pickScenario();
  const taskId = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : await discoverOpenTask();
  if (!taskId) {
    console.log(`${RED}✗${RESET} No funded, unclaimed task found. Start the buyer first (pnpm demo:buyer).`);
    process.exit(1);
  }
  console.log(`${DIM}▶${RESET} Discovered Open Task: ${BOLD}${taskId}${RESET}`);
  console.log(`${GREEN}✔${RESET} Claiming ${taskId} with a "${YELLOW}${scenario}${RESET}" implementation...`);

  const produced = await fetch(`${ORCHESTRATOR}/api/tasks/${taskId}/produce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!produced.ok) {
    const err = (await produced.json()) as { error?: string };
    throw new Error(`produce failed (${produced.status}): ${err.error ?? "unknown"}`);
  }
  const { transaction: withOutput } = (await produced.json()) as { transaction: Transaction };
  console.log(`${GREEN}✔${RESET} Code Submitted! Commit Hash: ${DIM}${withOutput.provider?.commitHash}${RESET}`);
  console.log(`${DIM}▶${RESET} Triggering Independent Verifier...`);

  const verified = await fetch(`${ORCHESTRATOR}/api/tasks/${taskId}/verify`, { method: "POST" });
  if (!verified.ok) {
    const err = (await verified.json()) as { error?: string };
    throw new Error(`verify failed (${verified.status}): ${err.error ?? "unknown"}`);
  }
  const { transaction: tx } = (await verified.json()) as { transaction: Transaction };

  const v = tx.verification;
  console.log(`\n${BLUE}=======================================${RESET}`);
  console.log(`${BOLD}VERIFICATION RESULTS: ${tx.id}${RESET}`);
  console.log(`${BLUE}=======================================${RESET}`);
  if (v) {
    for (const c of v.checks) {
      const mark = c.status === "pass" ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  [${mark}] ${c.label.padEnd(22)} ${c.detail}`);
    }
  }
  console.log();
  if (tx.escrow === "RELEASED") {
    console.log(`${GREEN}✔ VERIFICATION PASSED!${RESET} Escrow funds released to wallet.`);
    console.log(`${DIM}Settlement TX: ${tx.receipt?.settlementTx}${RESET}`);
  } else {
    console.log(`${RED}✗ VERIFICATION FAILED!${RESET} No payment. Escrow refunded to buyer.`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`[provider]  ${err && err.message ? err.message : err}`);
  console.error(`[provider]  is the orchestrator running?  (pnpm demo:server)`);
  process.exit(1);
});
