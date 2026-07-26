#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { basename, relative, resolve } from "node:path";
import { detectPackageManager, scaffold, toPackageName, type Transport } from "./scaffold.js";

interface ParsedArgs {
  name?: string;
  install: boolean;
  packageManager?: string;
  transport?: Transport;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { install: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-install") {
      args.install = false;
    } else if (arg === "--pm") {
      args.packageManager = argv[++i];
    } else if (arg === "--transport") {
      const value = argv[++i];
      if (value !== "stdio" && value !== "http") {
        console.error(`Invalid --transport value "${value}" — expected "stdio" or "http".`);
        process.exit(1);
      }
      args.transport = value;
    } else if (arg === "--stdio") {
      args.transport = "stdio";
    } else if (arg === "--http") {
      args.transport = "http";
    } else if (!arg.startsWith("-") && !args.name) {
      args.name = arg;
    }
  }
  return args;
}

/**
 * Reads one line per call via the interface's async iterator rather than repeated
 * `rl.question()` calls. `question()` resolves off a one-shot `once('line', ...)` listener,
 * but readline parses *all* buffered stdin into `line` events as soon as it arrives —
 * on piped input, a second line can arrive (and fire, to no listener) before the first
 * question's answer even resolves, silently dropping it. The async iterator uses an
 * internal queue that holds lines until something actually asks for them, so nothing
 * gets lost regardless of how fast the input arrives.
 */
function createPrompter(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(question: string): Promise<string> {
      process.stdout.write(question);
      const { value, done } = await lines.next();
      return done ? "" : value.trim();
    },
    close: () => rl.close(),
  };
}

async function promptForName(ask: (q: string) => Promise<string>): Promise<string> {
  const answer = await ask("Project name (my-mcp-server): ");
  return answer || "my-mcp-server";
}

async function promptForTransport(ask: (q: string) => Promise<string>): Promise<Transport> {
  console.log("\nWhich transport should this server use?");
  console.log("  1) stdio  — what most MCP hosts expect (Claude Desktop, Claude Code, Cursor, ...)");
  console.log("  2) http   — serves over HTTP, useful for remote/hosted servers");
  for (;;) {
    const answer = await ask("Select 1 or 2 (default: 1): ");
    if (answer === "" || answer === "1" || answer.toLowerCase() === "stdio") return "stdio";
    if (answer === "2" || answer.toLowerCase() === "http") return "http";
    console.log(`"${answer}" isn't a valid choice — enter 1, 2, "stdio", or "http".`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const needsPrompt = args.name === undefined || args.transport === undefined;
  const prompter = needsPrompt ? createPrompter() : undefined;

  const rawName = args.name ?? (await promptForName(prompter!.ask));
  const transport = args.transport ?? (await promptForTransport(prompter!.ask));
  prompter?.close();

  // `rawName` may be a plain project name ("my-app") or a path (relative or absolute,
  // e.g. "./apps/my-app" or "/tmp/my-app") — resolve() handles both against cwd, and the
  // project name for package.json/README is always derived from the resolved dir's basename.
  const targetDir = resolve(process.cwd(), rawName);
  const projectName = toPackageName(basename(targetDir));
  const packageManager = args.packageManager ?? detectPackageManager();

  console.log(`\nScaffolding "${projectName}" (${transport} transport) in ${targetDir}...\n`);

  try {
    await scaffold({ targetDir, projectName, transport, install: args.install, packageManager });
  } catch (err) {
    console.error(`\nFailed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`\nDone! Next steps:\n`);
  const relativeTarget = relative(process.cwd(), targetDir);
  if (relativeTarget) {
    console.log(`  cd ${relativeTarget}`);
  }
  if (!args.install) {
    console.log(`  ${packageManager} install`);
  }
  console.log(`  ${packageManager} run dev   # starts with the ${transport} transport\n`);
}

main();
