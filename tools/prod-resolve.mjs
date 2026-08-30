import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const ROOT = pathToFileURL(resolvePath(fileURLToPath(import.meta.url), "../..") + "/").href;

const SCOPES = {
  "@tokenpact/core": "packages/core/dist/index.js",
  "@tokenpact/verifier": "apps/verifier/dist/index.js",
  "@tokenpact/orchestrator": "apps/orchestrator/dist/src/server.js",
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(SCOPES, specifier)) {
    return { url: new URL(SCOPES[specifier], ROOT).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
