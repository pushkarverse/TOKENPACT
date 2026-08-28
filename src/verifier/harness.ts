// Verifier sandbox harness.
//
// This file runs in a *separate Node process* spawned by the verifier, with a
// hard timeout applied by the parent. It loads the provider's code, runs the
// spec's tests, checks the return schema, and measures latency — then prints a
// single JSON line to stdout. It imports nothing from the app: the only thing
// crossing the boundary is untrusted candidate code and plain data.
//
// A separate process + timeout is a lightweight sandbox suitable for a
// prototype. A production verifier would harden this further (container / VM /
// seccomp, no filesystem or network), but the trust model is the same: the
// verifier executes the work rather than trusting the provider's claims.

import { readFileSync } from "node:fs";

type Job = {
  fn: string;
  code: string;
  tests: { input: unknown[]; expected: unknown }[];
  schema: string;
  latency: { input: unknown[]; iterations: number; capMs: number };
  budgetMs: number;
};

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function p95Of(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return Math.round(sorted[idx] * 1000) / 1000;
}

function main() {
  const jobPath = process.argv[2];
  const job: Job = JSON.parse(readFileSync(jobPath, "utf8"));

  const out: any = {
    compiled: false,
    error: null,
    tests: { passed: 0, total: job.tests.length, cases: [] as any[] },
    schema: { expected: job.schema, got: "n/a", match: false },
    latency: { p95Ms: null as number | null, samples: 0, capped: false, slow: false },
  };

  // 1. Load the candidate. A syntax error here means "does not compile".
  let fn: ((...args: unknown[]) => unknown) | undefined;
  try {
    const factory = new Function(`${job.code}\n;return typeof ${job.fn} === "function" ? ${job.fn} : undefined;`);
    fn = factory();
  } catch (e: any) {
    out.error = String(e && e.message ? e.message : e);
    process.stdout.write(JSON.stringify(out));
    return;
  }
  if (typeof fn !== "function") {
    out.error = `function ${job.fn} was not defined`;
    process.stdout.write(JSON.stringify(out));
    return;
  }
  out.compiled = true;

  // 2. Unit tests.
  for (let i = 0; i < job.tests.length; i++) {
    const t = job.tests[i];
    let got: unknown;
    let pass = false;
    let err: string | null = null;
    try {
      got = fn(...t.input);
      pass = eq(got, t.expected);
    } catch (e: any) {
      err = String(e && e.message ? e.message : e);
      got = undefined;
    }
    if (pass) out.tests.passed++;
    out.tests.cases.push({ index: i, input: t.input, expected: t.expected, got, pass, error: err });
  }

  // 3. Schema — the runtime type of a representative return value.
  try {
    const sample = fn(...job.tests[0].input);
    out.schema.got = typeof sample;
    out.schema.match = out.schema.got === job.schema;
  } catch {
    out.schema.got = "threw";
    out.schema.match = false;
  }

  // 4. Latency — measured, with a wall-clock cap so a pathological impl can't
  //    hang the verifier. If we blow the cap, that itself is a latency failure.
  try {
    fn(...job.latency.input); // warmup
  } catch {}
  const durations: number[] = [];
  const startAll = performance.now();
  for (let i = 0; i < job.latency.iterations; i++) {
    const t0 = performance.now();
    try {
      fn(...job.latency.input);
    } catch {}
    durations.push(performance.now() - t0);
    if (performance.now() - startAll > job.latency.capMs) {
      out.latency.capped = true;
      break;
    }
  }
  out.latency.samples = durations.length;
  out.latency.p95Ms = p95Of(durations);
  out.latency.slow = out.latency.p95Ms !== null && out.latency.p95Ms > job.budgetMs;

  process.stdout.write(JSON.stringify(out));
}

main();
