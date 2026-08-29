// Entrypoint for the dev resolve hook. Use with Node's --import flag:
//
//   node --import ./tools/ts-run.mjs apps/orchestrator/scripts/smoke.ts
//
// This registers the resolve hook (which runs on its own thread, so it must live
// in a separate module) and then Node's built-in type stripping runs the .ts
// source directly. No build, no install required.

import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
