#!/usr/bin/env node
import * as p from "@clack/prompts";
import color from "picocolors";
import gradient from "gradient-string";
import { basename, relative, resolve } from "node:path";
import { detectPackageManager, runInstall, scaffold, toPackageName, type Auth, type Transport } from "./scaffold.js";

interface ParsedArgs {
  name?: string;
  install: boolean;
  packageManager?: string;
  transport?: Transport;
  auth?: Auth;
  port?: number;
  widget?: boolean;
  tailwind?: boolean;
  help: boolean;
  yes: boolean;
}

const BANNER = `
 ███╗   ███╗ ██████╗██████╗ ███████╗██╗   ██╗
 ████╗ ████║██╔════╝██╔══██╗██╔════╝╚██╗ ██╔╝
 ██╔████╔██║██║     ██████╔╝█████╗   ╚████╔╝
 ██║╚██╔╝██║██║     ██╔═══╝ ██╔══╝    ╚██╔╝
 ██║ ╚═╝ ██║╚██████╗██║     ██║        ██║
 ╚═╝     ╚═╝ ╚═════╝╚═╝     ╚═╝        ╚═╝
`.trimEnd();

const brand = gradient(["#e5e5e5", "#737373", "#e5e5e5"]);

function parsePortValue(value: string | undefined, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    console.error(`Invalid ${flag} value "${value}" — expected a non-negative integer (e.g. 3000).`);
    process.exit(1);
  }
  return n;
}

function printHelp(): void {
  console.log(`
${color.bold("create-mcpfy-app")} — scaffold an MCP server with mcpfy

${color.dim("Usage:")}
  npx create-mcpfy-app@latest [name] [options]

${color.dim("Options:")}
  --stdio, --http, --transport <stdio|http>
  --auth <none|header|oauth>
  --port <n>              HTTP listen port (default 3000)
  --no-widget             tools/prompts/resources only (no React UI)
  --tailwind              widget UI styled with Tailwind CSS
  --pm <npm|pnpm|yarn>
  --no-install
  -y, --yes               skip prompts (defaults: stdio, no auth, widget, no Tailwind)
  -h, --help
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { install: true, help: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg === "--no-install") args.install = false;
    else if (arg === "--widget") args.widget = true;
    else if (arg === "--no-widget") args.widget = false;
    else if (arg === "--tailwind") args.tailwind = true;
    else if (arg === "--no-tailwind") args.tailwind = false;
    else if (arg === "--pm") args.packageManager = argv[++i];
    else if (arg === "--transport") {
      const value = argv[++i];
      if (value !== "stdio" && value !== "http") {
        console.error(`Invalid --transport value "${value}" — expected "stdio" or "http".`);
        process.exit(1);
      }
      args.transport = value;
    } else if (arg === "--stdio") args.transport = "stdio";
    else if (arg === "--http") args.transport = "http";
    else if (arg === "--port") args.port = parsePortValue(argv[++i], "--port");
    else if (arg.startsWith("--port=")) args.port = parsePortValue(arg.slice("--port=".length), "--port");
    else if (arg === "--auth") {
      const value = argv[++i];
      if (value !== "none" && value !== "header" && value !== "oauth") {
        console.error(`Invalid --auth value "${value}" — expected "none", "header", or "oauth".`);
        process.exit(1);
      }
      args.auth = value;
    } else if (!arg.startsWith("-") && !args.name) {
      args.name = arg;
    }
  }
  return args;
}

function exitIfCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Maybe next time.");
    process.exit(0);
  }
  return value;
}

async function promptMissing(args: ParsedArgs): Promise<{
  name: string;
  transport: Transport;
  auth: Auth;
  port: number;
  widget: boolean;
  tailwind: boolean;
}> {
  const skip = args.yes || !process.stdin.isTTY;

  const name = args.name
    ? args.name
    : skip
      ? "my-mcp-server"
      : String(
          exitIfCancel(
            await p.text({
              message: "What is your project named?",
              placeholder: "my-mcp-server",
              defaultValue: "my-mcp-server",
            })
          )
        ).trim() || "my-mcp-server";

  const transport: Transport = args.transport
    ? args.transport
    : skip
      ? "stdio"
      : exitIfCancel(
          await p.select({
            message: "How should hosts connect?",
            options: [
              {
                value: "stdio" as const,
                label: "stdio",
                hint: "Claude Desktop, Cursor, Claude Code",
              },
              {
                value: "http" as const,
                label: "HTTP",
                hint: "remote / hosted MCP",
              },
            ],
            initialValue: "stdio" as const,
          })
        );

  const auth: Auth = args.auth
    ? args.auth
    : skip
      ? "none"
      : exitIfCancel(
          await p.select({
            message: "Lock the server down?",
            options: [
              { value: "none" as const, label: "Open", hint: "no auth" },
              { value: "header" as const, label: "API key", hint: "bearer token (HTTP)" },
              { value: "oauth" as const, label: "OAuth", hint: "PKCE + JWKS (HTTP)" },
            ],
            initialValue: "none" as const,
          })
        );

  let port = args.port ?? 3000;
  if (transport === "http" && args.port === undefined && !skip) {
    const raw = String(
      exitIfCancel(
        await p.text({
          message: "Which HTTP port?",
          placeholder: "3000",
          defaultValue: "3000",
          validate(value) {
            if (value === "") return undefined;
            const n = Number(value);
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
              return "Enter a non-negative integer";
            }
            return undefined;
          },
        })
      )
    );
    port = raw === "" ? 3000 : Number(raw);
  }

  const widget =
    args.widget !== undefined
      ? args.widget
      : skip
        ? true
        : exitIfCancel(
            await p.confirm({
              message: "Include a React widget UI? (use --no-widget to skip)",
              initialValue: true,
            })
          );

  const tailwind =
    !widget
      ? false
      : args.tailwind !== undefined
        ? args.tailwind
        : skip
          ? false
          : exitIfCancel(
              await p.confirm({
                message: "Style the widget with Tailwind CSS?",
                initialValue: false,
              })
            );

  return { name, transport, auth, port, widget, tailwind };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log(brand.multiline(BANNER));
  console.log();
  p.intro(color.bold("Create an MCP server"));
  p.log.message(color.dim("React widget by default. Pass --no-widget for tools/prompts/resources only."));

  const answers = await promptMissing(args);
  const targetDir = resolve(process.cwd(), answers.name);
  const projectName = toPackageName(basename(targetDir));
  const packageManager = args.packageManager ?? detectPackageManager();

  const summary = [
    `${color.dim("name")}      ${color.bold(projectName)}`,
    `${color.dim("transport")} ${answers.transport}${answers.transport === "http" ? `:${answers.port}` : ""}`,
    `${color.dim("auth")}      ${answers.auth}`,
    `${color.dim("widget")}    ${answers.widget ? color.magenta(answers.tailwind ? "React + Tailwind" : "React UI") : color.dim("none")}`,
  ].join("\n");
  p.note(summary, "Plan");

  try {
    const spin = p.spinner();
    spin.start("Laying down files");
    await scaffold({
      targetDir,
      projectName,
      transport: answers.transport,
      auth: answers.auth,
      port: answers.port,
      widget: answers.widget,
      tailwind: answers.tailwind,
      install: false,
      packageManager,
    });
    spin.stop("Project ready");

    if (args.install) {
      spin.start(`Installing with ${packageManager}`);
      await runInstall(packageManager, targetDir);
      spin.stop("Dependencies installed");
    }
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const relativeTarget = relative(process.cwd(), targetDir);
  console.log();
  console.log(color.bold("  Next"));
  if (relativeTarget) console.log(`  ${color.cyan("cd")} ${relativeTarget}`);
  if (!args.install) console.log(`  ${color.cyan(packageManager)} install`);
  console.log(`  ${color.cyan(`${packageManager} run dev`)}`);
  console.log();
  p.outro("Done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
