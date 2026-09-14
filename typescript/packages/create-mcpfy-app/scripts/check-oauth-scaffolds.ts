import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTemplate, type OAuthProvider } from "../src/scaffold.js";

const providers: OAuthProvider[] = [
  "auth0",
  "better-auth",
  "clerk",
  "keycloak",
  "supabase",
  "workos",
  "custom",
];

const root = mkdtempSync(join(tmpdir(), "create-mcpfy-oauth-"));
try {
  for (const provider of providers) {
    for (const widget of [false, true]) {
      const target = join(root, `${provider}-${widget ? "widget" : "plain"}`);
      copyTemplate(
        target,
        "oauth-test",
        "http",
        "oauth",
        4123,
        widget,
        false,
        provider,
      );
      const server = readFileSync(join(target, "src/server.ts"), "utf8");
      const env = readFileSync(join(target, ".env.example"), "utf8");
      const readme = readFileSync(join(target, "README.md"), "utf8");
      if (!server.includes("auth: oauth."))
        throw new Error(`${provider}: missing OAuth config`);
      if (!env.includes("MCP_URL=http://localhost:4123/"))
        throw new Error(`${provider}: missing MCP_URL`);
      if (readme.includes("--stdio"))
        throw new Error(`${provider}: OAuth README recommends stdio`);
      if (`${server}${env}${readme}`.includes("{{"))
        throw new Error(`${provider}: unresolved placeholder`);
    }
  }

  for (const widget of [false, true]) {
    const target = join(root, `none-${widget ? "widget" : "plain"}`);
    copyTemplate(target, "stdio-test", "stdio", "none", 4123, widget);
    const readme = readFileSync(join(target, "README.md"), "utf8");
    const config = readme.match(/```json\n([\s\S]*?)\n```/)?.[1];
    if (!config || !JSON.parse(config))
      throw new Error("Invalid stdio host configuration");
    if (readme.includes("{{")) throw new Error("Unresolved README placeholder");
  }

  console.log(`Checked ${providers.length * 2} OAuth and 2 stdio scaffolds`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
