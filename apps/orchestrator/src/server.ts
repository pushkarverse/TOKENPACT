import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTask,
  fundEscrow,
  attachProvider,
  runVerification,
  getTx,
  getLedger,
  resetLedger,
  stats,
} from "./store.js";
import { ADDRESSES } from "./x402.js";
import { buildSpec, SCENARIO_META } from "@tokenpact/core";
import type { ProviderScenario, PaymentPayload } from "@tokenpact/core";

const PORT = Number(process.env.ORCHESTRATOR_PORT || process.env.PORT) || 8402;
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function sendJson(res: any, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(extraHeaders || {}),
  });
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

export default async function handler(req: any, res: any) {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    
    if (path === "/api/state" && method === "GET") {
      return sendJson(res, 200, {
        spec: buildSpec(),
        scenarios: SCENARIO_META,
        addresses: ADDRESSES,
        ledger: getLedger(),
        stats: stats(),
      });
    }

    if (path === "/api/reset" && method === "POST") {
      resetLedger();
      return sendJson(res, 200, { ok: true, ledger: getLedger(), stats: stats() });
    }

    if (path === "/api/tasks" && method === "POST") {
      const tx = createTask();
      return sendJson(
        res,
        402,
        { x402Version: tx.offer?.x402Version ?? 1, accepts: tx.offer ? [tx.offer] : [], offer: tx.offer, transaction: tx },
        { "www-authenticate": `x402 network="${tx.offer?.network}", resource="${tx.offer?.resource}"` },
      );
    }

    const payMatch = path.match(/^\/api\/tasks\/([^/]+)\/pay$/);
    if (payMatch && method === "POST") {
      const id = payMatch[1] as string;
      const body = await readBody(req);
      const headerPay = req.headers["x-payment"];
      const source: string | PaymentPayload | null =
        typeof headerPay === "string" && headerPay.length > 0
          ? headerPay
          : body && body.payment
            ? (body.payment as PaymentPayload)
            : null;
      try {
        const tx = fundEscrow(id, source);
        const paymentResponse = Buffer.from(
          JSON.stringify({
            success: true,
            txId: tx.id,
            escrow: tx.escrow,
            payer: tx.payment?.authorization.from,
            network: tx.offer?.network,
            settledAt: tx.fundedAt,
          }),
        ).toString("base64");
        return sendJson(res, 200, { transaction: tx, stats: stats() }, { "x-payment-response": paymentResponse });
      } catch (err: any) {
        const tx = getTx(id);
        return sendJson(res, 402, { error: String(err && err.message ? err.message : err), offer: tx?.offer ?? null });
      }
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

    if (path === "/api/tollbooth" && method === "POST") {
      
      const offer = {
        status: 402,
        x402Version: 1,
        paymentId: "tb-" + Math.random().toString(36).substring(2, 9),
        scheme: "exact",
        amountCents: 1,
        asset: "USDC",
        network: "base-sepolia",
        payTo: ADDRESSES.escrow,
        nonce: Math.random().toString(36).substring(2, 9),
        resource: "/api/tollbooth",
        description: "Metered API Access",
        validUntil: Date.now() + 60000,
      };
      return sendJson(
        res,
        402,
        { x402Version: 1, accepts: [offer], offer },
        { "www-authenticate": `x402 network="${offer.network}", resource="${offer.resource}"` },
      );
    }

    if (path === "/api/tollbooth/pay" && method === "POST") {
      const body = await readBody(req);
      const headerPay = req.headers["x-payment"];
      const source: string | PaymentPayload | null =
        typeof headerPay === "string" && headerPay.length > 0
          ? headerPay
          : body && body.payment
            ? (body.payment as PaymentPayload)
            : null;
      try {
        const { processTollboothPayment } = await import("./store.js");
        const result = processTollboothPayment(source);
        const paymentResponse = Buffer.from(
          JSON.stringify({
            success: true,
            txId: result.payment.paymentId,
            escrow: "SETTLED_INSTANTLY",
            payer: result.payment.authorization.from,
            network: result.offer.network,
            settledAt: Date.now(),
          }),
        ).toString("base64");
        return sendJson(res, 200, { data: result.data, stats: stats() }, { "x-payment-response": paymentResponse });
      } catch (err: any) {
        return sendJson(res, 402, { error: String(err && err.message ? err.message : err) });
      }
    }

    const verifyMatch = path.match(/^\/api\/tasks\/([^/]+)\/verify$/);
    if (verifyMatch && method === "POST") {
      const tx = await runVerification(verifyMatch[1] as string);
      return sendJson(res, 200, { transaction: tx, stats: stats() });
    }

    const getMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (getMatch && method === "GET") {
      const tx = getTx(getMatch[1] as string);
      if (!tx) return sendJson(res, 404, { error: "unknown transaction" });
      return sendJson(res, 200, { transaction: tx });
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
}

const server = createServer(handler);

if (process.env.NODE_ENV !== "production" || process.env.RUN_LOCAL) {
  server.listen(PORT, () => {
    console.log(`\x1b[36m
    ████████╗ ██████╗ ██╗  ██╗███████╗███╗   ██╗██████╗  █████╗  ██████╗████████╗
    ╚══██╔══╝██╔═══██╗██║ ██╔╝██╔════╝████╗  ██║██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
       ██║   ██║   ██║█████╔╝ █████╗  ██╔██╗ ██║██████╔╝███████║██║        ██║   
       ██║   ██║   ██║██╔═██╗ ██╔══╝  ██║╚██╗██║██╔═══╝ ██╔══██║██║        ██║   
       ██║   ╚██████╔╝██║  ██╗███████╗██║ ╚████║██║     ██║  ██║╚██████╗   ██║   
       ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝   
    \x1b[0m`);
    console.log(`  \x1b[1mTokenPact\x1b[0m  ·  reverse escrow for AI agents`);
    console.log(`  escrow account →  \x1b[33m${ADDRESSES.escrow}\x1b[0m`);
    console.log(`  running        →  \x1b[32mhttp://localhost:${PORT}\x1b[0m\n`);
  });
}
