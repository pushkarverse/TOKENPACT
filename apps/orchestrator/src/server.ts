import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createTask, attachProvider, runVerification, getLedger, stats } from "./store.js";
import { buildSpec, SCENARIO_META } from "@tokenpact/core";
import type { ProviderScenario } from "@tokenpact/core";

const PORT = Number(process.env.PORT) || 4021;
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function sendJson(res: any, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c: any) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function serveStatic(res: any, urlPath: string) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const full = normalize(join(PUBLIC_DIR, rel));
  if (!full.startsWith(normalize(PUBLIC_DIR))) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  try {
    const buf = await readFile(full);
    res.writeHead(200, { "content-type": MIME[extname(full)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // --- API ---------------------------------------------------------------
    if (path === "/api/state" && method === "GET") {
      return sendJson(res, 200, {
        spec: buildSpec(),
        scenarios: SCENARIO_META,
        ledger: getLedger(),
        stats: stats(),
      });
    }

    if (path === "/api/tasks" && method === "POST") {
      // Buyer agent authors the task; funds lock in escrow.
      const tx = createTask();
      return sendJson(res, 201, { transaction: tx });
    }

    const produceMatch = path.match(/^\/api\/tasks\/([^/]+)\/produce$/);
    if (produceMatch && method === "POST") {
      const body = await readBody(req);
      const scenario = body.scenario as ProviderScenario;
      if (!["honest", "faulty", "slow"].includes(scenario)) {
        return sendJson(res, 400, { error: "scenario must be honest | faulty | slow" });
      }
      const tx = attachProvider(produceMatch[1] as string, scenario as ProviderScenario);
      return sendJson(res, 200, { transaction: tx });
    }

    const verifyMatch = path.match(/^\/api\/tasks\/([^/]+)\/verify$/);
    if (verifyMatch && method === "POST") {
      const tx = runVerification(verifyMatch[1] as string);
      return sendJson(res, 200, { transaction: tx, stats: stats() });
    }

    if (path === "/api/ledger" && method === "GET") {
      return sendJson(res, 200, { ledger: getLedger(), stats: stats() });
    }

    if (path.startsWith("/api/")) {
      return sendJson(res, 404, { error: "unknown endpoint" });
    }

    return serveStatic(res, path);
  } catch (err: any) {
    return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  TokenPact  ·  reverse escrow for AI agents`);
  console.log(`  running →  http://localhost:${PORT}\n`);
});
