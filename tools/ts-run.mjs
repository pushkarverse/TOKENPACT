import { register } from "node:module";

register("tsx", import.meta.url);
register("./ts-resolve.mjs", import.meta.url);
