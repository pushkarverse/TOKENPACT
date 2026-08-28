// CLI smoke test / terminal demo: runs all three provider agents through the
// full reverse-escrow flow and prints what the verifier decided.
//   node scripts/smoke.ts

import { createTask, attachProvider, runVerification } from "../src/store.ts";
import type { ProviderScenario } from "../src/types.ts";
import { centsToUsd } from "../src/util.ts";

const scenarios: ProviderScenario[] = ["honest", "faulty", "slow"];

for (const scenario of scenarios) {
  const t0 = createTask();
  attachProvider(t0.id, scenario);
  const tx = runVerification(t0.id);
  const v = tx.verification!;
  console.log(`\n${tx.id}  provider=${scenario}  (${tx.provider!.headline})`);
  for (const c of v.checks) {
    console.log(`   [${c.status === "pass" ? "✓" : "✗"}] ${c.label.padEnd(24)} ${c.detail}`);
  }
  const outcome = tx.escrow === "RELEASED" ? `RELEASED  ${centsToUsd(tx.amountCents)} → provider` : `REFUNDED  $0.00 → buyer`;
  console.log(`   escrow: ${tx.escrow}   →   ${outcome}`);
  console.log(`   verifier signature: ${v.signature}`);
}
console.log("");
