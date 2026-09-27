import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findCrossHomeOwner } from "../../src/cli/cross-home-owner";
import { removeTreeWithRetry } from "../helpers/remove-tree";
import { repoPath } from "../helpers/repo-root";

const originalEnv = { ...process.env };
const roots: string[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];
const children: Array<ReturnType<typeof Bun.spawn>> = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ocx-cross-home-"));
  roots.push(root);
  const home = join(root, "home");
  const ocx = join(root, "secondary");
  const codex = join(root, "codex");
  const grok = join(root, "grok");
  const claude = join(root, "claude");
  for (const dir of [home, ocx, codex, grok, claude, join(home, ".opencodex"), join(claude, "agents")]) {
    mkdirSync(dir, { recursive: true });
  }
  Object.assign(process.env, {
    HOME: home, USERPROFILE: home, OPENCODEX_HOME: ocx, CODEX_HOME: codex,
    GROK_HOME: grok, CLAUDE_CONFIG_DIR: claude,
  });
  return { root, home, ocx, codex, grok, claude };
}

function healthServer(pid: number | null, service = "opencodex") {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: () => Response.json({ service, status: "ok", version: "0.0.0", uptime: 1, pid }),
  });
  servers.push(server);
  return server.port;
}

function grokFence(port: number | string) {
  return `# user content\n# >>> opencodex managed block — do not edit (removed by \`ocx stop\`) >>>\n[model_providers.opencodex]\nbase_url = "http://127.0.0.1:${port}/v1"\n# <<< opencodex managed block <<<\n`;
}

function codexRouting(port: number | string) {
  return `model_provider = "opencodex"\n[model_providers.opencodex]\nbase_url = "http://127.0.0.1:${port}/v1"\n`;
}

async function waitForRuntime(path: string, child: ReturnType<typeof Bun.spawn>) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      try {
        const record = JSON.parse(readFileSync(path, "utf8")) as { pid: number; port: number; siblingOfPort?: number };
        if (record.pid === child.pid) return record;
      } catch { /* publication in progress */ }
    }
    if (child.exitCode !== null) throw new Error(`secondary exited ${child.exitCode}: ${await new Response(child.stderr).text()}`);
    await Bun.sleep(20);
  }
  throw new Error("timed out waiting for secondary runtime record");
}

afterEach(async () => {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  for (const child of children.splice(0)) await child.exited;
  for (const server of servers.splice(0)) server.stop(true);
  for (const root of roots.splice(0)) removeTreeWithRetry(root);
  for (const key of ["HOME", "USERPROFILE", "OPENCODEX_HOME", "CODEX_HOME", "GROK_HOME", "CLAUDE_CONFIG_DIR"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("only a distinct live identity in the default-home record counts", async () => {
  const fx = fixture();
  const port = healthServer(process.pid + 1);
  const record = join(fx.home, ".opencodex", "runtime-port.json");
  writeFileSync(record, JSON.stringify({ pid: process.pid + 1, port }));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBe(port);
  writeFileSync(record, JSON.stringify({ pid: process.pid, port }));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBe(port); // the responder, not a stale record, owns the port
});

test("managed Grok and Codex hints accept only a different positive PID", async () => {
  const fx = fixture();
  const port = healthServer(process.pid + 1);
  const grokPath = join(fx.grok, "config.toml");
  const codexPath = join(fx.codex, "config.toml");
  writeFileSync(grokPath, grokFence(port));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBe(port);
  writeFileSync(grokPath, "# no managed fence\n");
  writeFileSync(codexPath, codexRouting(port));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBe(port);
  writeFileSync(codexPath, codexRouting("invalid"));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
});

test("same PID, null PID, foreign, stale and remote hints grant no sibling ownership", async () => {
  const fx = fixture();
  const grokPath = join(fx.grok, "config.toml");
  for (const pid of [process.pid, null]) {
    const port = healthServer(pid);
    writeFileSync(grokPath, grokFence(port));
    expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
  }
  const foreign = healthServer(process.pid + 1, "another-service");
  writeFileSync(grokPath, grokFence(foreign));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
  const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("closed") });
  const stale = closed.port;
  closed.stop(true);
  writeFileSync(grokPath, grokFence(stale));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
  writeFileSync(grokPath, grokFence("not-a-port"));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
  writeFileSync(grokPath, grokFence(foreign).replace("127.0.0.1", "example.com"));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
  writeFileSync(join(fx.codex, "config.toml"), codexRouting(foreign).replace("127.0.0.1", "example.com"));
  expect(await findCrossHomeOwner({ homeDir: fx.home })).toBeNull();
});

test("a secondary start preserves shared client bytes and records the sibling owner", async () => {
  const fx = fixture();
  const fakeOwnerPid = 1_000_000_000;
  const ownerPort = healthServer(fakeOwnerPid);
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserved") });
  const secondaryPort = reservation.port;
  reservation.stop(true);
  writeFileSync(join(fx.home, ".opencodex", "runtime-port.json"), JSON.stringify({ pid: fakeOwnerPid, port: ownerPort }));
  const grokPath = join(fx.grok, "config.toml");
  const codexPath = join(fx.codex, "config.toml");
  const claudePath = join(fx.claude, "agents", "ocx-existing.md");
  writeFileSync(grokPath, grokFence(ownerPort));
  writeFileSync(codexPath, codexRouting(ownerPort));
  writeFileSync(claudePath, "owned roster bytes\n");
  const before = [grokPath, codexPath, claudePath].map(path => readFileSync(path));
  writeFileSync(join(fx.ocx, "config.json"), JSON.stringify({
    port: secondaryPort, hostname: "127.0.0.1", codexAutoStart: false, syncResumeHistory: false,
    checkForUpdates: false, clientIntegrations: { codex: true, grok: true, "claude-desktop": false },
    claudeCode: { injectAgents: false, systemEnv: false }, providers: {}, defaultProvider: "openai",
  }));
  const child = Bun.spawn([process.execPath, repoPath("src/cli/index.ts"), "start", "--port", String(secondaryPort)], {
    cwd: fx.root, env: { ...process.env, NO_PROXY: "127.0.0.1,localhost" }, stdout: "pipe", stderr: "pipe",
  });
  children.push(child);
  const runtime = await waitForRuntime(join(fx.ocx, "runtime-port.json"), child);
  expect(runtime.siblingOfPort).toBe(ownerPort);
  expect([grokPath, codexPath, claudePath].map(path => readFileSync(path))).toEqual(before);
  child.kill("SIGTERM");
  await child.exited;
  expect([grokPath, codexPath, claudePath].map(path => readFileSync(path))).toEqual(before);
}, 30_000);

test("a lone custom-home start still syncs Grok and prunes its own Claude roster", async () => {
  const fx = fixture();
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserved") });
  const port = reservation.port;
  reservation.stop(true);
  const grokPath = join(fx.grok, "config.toml");
  const claudePath = join(fx.claude, "agents", "ocx-existing.md");
  writeFileSync(grokPath, grokFence(12345));
  writeFileSync(claudePath, "---\ngenerated-by: opencodex\n---\nold roster\n");
  writeFileSync(join(fx.ocx, "config.json"), JSON.stringify({
    port, hostname: "127.0.0.1", codexAutoStart: false, syncResumeHistory: false,
    checkForUpdates: false, clientIntegrations: { codex: false, grok: true, "claude-desktop": false },
    claudeCode: { injectAgents: false, systemEnv: false }, providers: {}, defaultProvider: "openai",
  }));
  const child = Bun.spawn([process.execPath, repoPath("src/cli/index.ts"), "start", "--port", String(port)], {
    cwd: fx.root, env: { ...process.env, NO_PROXY: "127.0.0.1,localhost" }, stdout: "pipe", stderr: "pipe",
  });
  children.push(child);
  const runtime = await waitForRuntime(join(fx.ocx, "runtime-port.json"), child);
  expect(runtime.siblingOfPort).toBeUndefined();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && readFileSync(grokPath, "utf8").includes("127.0.0.1:12345")) await Bun.sleep(20);
  expect(readFileSync(grokPath, "utf8")).toContain(`127.0.0.1:${port}`);
  expect(existsSync(claudePath)).toBe(false);
}, 30_000);
