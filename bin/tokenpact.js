#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const command = args[0] || "all";

function runService(name, color, scriptPath) {
  console.log(`\x1b[${color}m▶ Starting ${name}...\x1b[0m`);
  const child = spawn("node", ["--import", "./tools/prod-resolve.mjs", scriptPath], {
    cwd: ROOT,
    stdio: "pipe",
  });

  child.stdout.on("data", (data) => {
    process.stdout.write(
      data.toString().split("\n").map(line => line ? `\x1b[${color}m[${name}]\x1b[0m ${line}` : "").join("\n")
    );
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(
      data.toString().split("\n").map(line => line ? `\x1b[31m[${name} ERR]\x1b[0m ${line}` : "").join("\n")
    );
  });

  child.on("close", (code) => {
    console.log(`\x1b[${color}m■ ${name} exited with code ${code}\x1b[0m`);
  });

  return child;
}

if (command === "server" || command === "orchestrator") {
  runService("ORCHESTRATOR", "36", "apps/orchestrator/dist/src/server.js");
} else if (command === "buyer") {
  runService("BUYER_AGENT", "35", "agents/buyer/dist/index.js");
} else if (command === "provider") {
  runService("PROVIDER_AGENT", "32", "agents/provider/dist/index.js");
} else if (command === "all") {
  console.log("\x1b[1m\x1b[33mStarting TokenPact Ecosystem (Orchestrator + Buyer + Provider)...\x1b[0m\n");
  runService("ORCHESTRATOR", "36", "apps/orchestrator/dist/src/server.js");
  
  // Stagger agent startup to give server time to boot
  setTimeout(() => runService("PROVIDER_AGENT", "32", "agents/provider/dist/index.js"), 2000);
  setTimeout(() => runService("BUYER_AGENT", "35", "agents/buyer/dist/index.js"), 4000);
} else if (command === "smoke") {
  runService("SMOKE_TEST", "33", "apps/orchestrator/dist/scripts/smoke.js");
} else {
  console.log(`
\x1b[1mTokenPact CLI\x1b[0m

Usage: tokenpact <command>

Commands:
  all           Start Orchestrator, Buyer, and Provider agents together (Default)
  server        Start only the Orchestrator backend & UI
  buyer         Start only the Buyer Agent
  provider      Start only the Provider Agent
  smoke         Run the offline smoke test
  help          Show this help message
`);
}
