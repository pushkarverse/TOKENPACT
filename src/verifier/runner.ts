// The verifier agent.
//
// It takes a task spec and a provider's output, runs the provider's code in the
// sandbox harness (a separate process with a timeout), and returns a signed
// verdict. Crucially the verifier is independent: it is never paid by the
// provider, and it executes the work rather than trusting any claim about it.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { TaskSpec, ProviderOutput, VerificationResult, Check } from "./types.ts";

const VERIFIER_ID = "verifier.independent.agent";
const VERIFIER_SECRET = "tokenpact-verifier-key-v1"; // demo signing key
const HARNESS = fileURLToPath(new URL("./harness.ts", import.meta.url));
const SANDBOX_TIMEOUT_MS = 8000;

function sign(payload: unknown): string {
  return "sig_" + createHash("sha256").update(VERIFIER_SECRET + ":" + JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export function verify(spec: TaskSpec, output: ProviderOutput): VerificationResult {
  const job = {
    fn: spec.fn,
    code: output.code,
    tests: spec.tests,
    schema: spec.acceptIf.schema,
    latency: { input: spec.latencyProbe.input, iterations: spec.latencyProbe.iterations, capMs: 500 },
    budgetMs: spec.acceptIf.p95BudgetMs,
  };

  const dir = mkdtempSync(join(tmpdir(), "tp-verify-"));
  const jobPath = join(dir, "job.json");
  writeFileSync(jobPath, JSON.stringify(job));

  // Mirror only the TypeScript-execution flags from the parent (never --watch).
  const tsFlags = process.execArgv.filter((a) => a.includes("strip-types") || a.includes("transform-types"));

  const started = Date.now();
  const run = spawnSync(process.execPath, [...tsFlags, HARNESS, jobPath], {
    timeout: SANDBOX_TIMEOUT_MS,
    encoding: "utf8",
    env: { ...process.env },
  });
  const durationMs = Date.now() - started;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}

  const timedOut = run.error != null && (run.error as any).code === "ETIMEDOUT";

  let parsed: any = null;
  if (run.stdout) {
    try {
      parsed = JSON.parse(run.stdout.trim());
    } catch {
      parsed = null;
    }
  }

  const budget = spec.acceptIf.p95BudgetMs;

  // If the sandbox produced nothing usable, the verification fails closed.
  if (!parsed) {
    const checks: Check[] = [
      { id: "compiles", label: "Code compiles", detail: timedOut ? "sandbox timed out" : "no result", status: "fail" },
      { id: "tests", label: "Unit tests", detail: `0 / ${spec.tests.length}`, status: "fail" },
      { id: "latency", label: `Latency p95 < ${budget}ms`, detail: timedOut ? "timed out" : "not measured", status: "fail" },
      { id: "schema", label: "Output schema", detail: `expected ${spec.acceptIf.schema}`, status: "fail" },
    ];
    const base = {
      checks,
      compiled: false,
      testsPassed: 0,
      testsTotal: spec.tests.length,
      p95Ms: null,
      p95BudgetMs: budget,
      schemaExpected: spec.acceptIf.schema,
      schemaGot: "n/a",
      schemaMatch: false,
      timedOut,
      passed: false,
      verifier: VERIFIER_ID,
      ranAt: started,
      durationMs,
    };
    return { ...base, signature: sign(base) };
  }

  const compiled: boolean = parsed.compiled === true;
  const testsPassed: number = parsed.tests?.passed ?? 0;
  const testsTotal: number = parsed.tests?.total ?? spec.tests.length;
  const p95Ms: number | null = parsed.latency?.p95Ms ?? null;
  const schemaGot: string = parsed.schema?.got ?? "n/a";
  const schemaMatch: boolean = parsed.schema?.match === true;

  const testsOk = compiled && testsPassed === testsTotal;
  const latencyOk = compiled && p95Ms != null && p95Ms <= budget && parsed.latency?.capped !== true;
  const schemaOk = compiled && schemaMatch;

  const checks: Check[] = [
    {
      id: "compiles",
      label: "Code compiles",
      detail: compiled ? "loaded" : parsed.error ? String(parsed.error) : "failed to load",
      status: compiled ? "pass" : "fail",
    },
    {
      id: "tests",
      label: "Unit tests",
      detail: `${testsPassed} / ${testsTotal}`,
      status: testsOk ? "pass" : "fail",
    },
    {
      id: "latency",
      label: `Latency p95 < ${budget}ms`,
      detail: p95Ms == null ? "not measured" : `${p95Ms}ms ${latencyOk ? "≤" : ">"} ${budget}ms${parsed.latency?.capped ? " (capped)" : ""}`,
      status: latencyOk ? "pass" : "fail",
    },
    {
      id: "schema",
      label: "Output schema",
      detail: `${schemaGot} ${schemaMatch ? "=" : "≠"} ${spec.acceptIf.schema}`,
      status: schemaOk ? "pass" : "fail",
    },
  ];

  const passed = testsOk && latencyOk && schemaOk;

  const base = {
    checks,
    compiled,
    testsPassed,
    testsTotal,
    p95Ms,
    p95BudgetMs: budget,
    schemaExpected: spec.acceptIf.schema,
    schemaGot,
    schemaMatch,
    timedOut,
    passed,
    verifier: VERIFIER_ID,
    ranAt: started,
    durationMs,
  };
  return { ...base, signature: sign(base) };
}
