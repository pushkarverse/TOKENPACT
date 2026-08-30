import { register } from "node:module";
import "tsx";

register("./ts-resolve.mjs", import.meta.url);
