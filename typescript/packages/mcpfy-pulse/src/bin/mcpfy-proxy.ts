#!/usr/bin/env node
import { runProxy } from "../proxy/run.js";

runProxy(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`mcpfy-proxy: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
