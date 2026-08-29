// TokenPact dev resolve hook — lets the repo run straight from TypeScript source
// with nothing installed, using only Node's built-in type stripping (Node >= 22.6).
//
// It does two things the bare runtime can't:
//   1. maps the workspace scopes (@tokenpact/core, @tokenpact/verifier) to their
//      source entrypoints, so we don't need pnpm's node_modules symlinks; and
//   2. when a build hasn't run, rewrites a relative ".js" import to its ".ts"
//      sibling (the NodeNext convention writes ".js"; the source is ".ts").
//
// Production builds (tsc -> dist, then `node dist/...`) don't use this at all.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const ROOT = pathToFileURL(resolvePath(fileURLToPath(import.meta.url), "../..") + "/").href;

const SCOPES = {
  "@tokenpact/core": "packages/core/src/index.ts",
  "@tokenpact/verifier": "apps/verifier/src/index.ts",
  "@tokenpact/orchestrator": "apps/orchestrator/src/server.ts",
};

export async function resolve(specifier, context, nextResolve) {
  // 1. Workspace scope packages -> TypeScript source entrypoints.
  if (Object.prototype.hasOwnProperty.call(SCOPES, specifier)) {
    return { url: new URL(SCOPES[specifier], ROOT).href, shortCircuit: true };
  }

  // 2. Relative ".js" specifier with a ".ts" sibling (no build present) -> ".ts".
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    specifier.endsWith(".js") &&
    context.parentURL
  ) {
    const tsUrl = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(tsUrl))) {
      return { url: tsUrl.href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
