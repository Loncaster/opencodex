/** Best-effort discovery of a live proxy named by shared, OpenCodex-managed client state. */
import { closeSync, openSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getConfigDir } from "../config/paths";
import { getCodexHome } from "../codex/paths";
import { detectCodexRoutingDrift } from "../codex/routing-drift";
import { currentExternalCodexModelProvider } from "../codex/inject";
import { reconcileJournal } from "../codex/journal";
import { siblingOfLivePort } from "../codex/sibling-start";
import { readClientConnectionState } from "../client/state";
import { findManagedRegion, resolveGrokHome } from "../grok/inject";
import { providerTableString } from "../codex/injected-marker";
import { probePortOwner, START_OWNERSHIP_LIVENESS } from "../server/proxy-liveness";

const MAX_HINT_BYTES = 256 * 1024;

function readBounded(path: string): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const bytes = Buffer.alloc(MAX_HINT_BYTES + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    return count > MAX_HINT_BYTES ? null : bytes.toString("utf8", 0, count);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function validPort(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 65535;
}

function loopbackPort(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!url.port || !["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) return null;
    const port = Number(url.port);
    return validPort(port) ? port : null;
  } catch {
    return null;
  }
}

/** Returns only a different process with an identity-checked /healthz response. */
export async function findCrossHomeOwner(options: { homeDir?: string } = {}): Promise<number | null> {
  const candidates = new Set<number>();
  const defaultHome = join(options.homeDir ?? homedir(), ".opencodex");
  if (resolve(getConfigDir()) !== resolve(defaultHome)) {
    const raw = readBounded(join(defaultHome, "runtime-port.json"));
    if (raw) {
      try {
        const record: unknown = JSON.parse(raw);
        if (record && typeof record === "object" && validPort((record as { port?: unknown }).port)) {
          candidates.add((record as { port: number }).port);
        }
      } catch { /* stale or malformed hint */ }
    }
  }

  const grok = readBounded(join(resolveGrokHome(), "config.toml"));
  const region = grok === null ? null : findManagedRegion(grok);
  if (grok && region && !region.orphaned) {
    const port = loopbackPort(providerTableString(grok.slice(region.start, region.end), "opencodex", "base_url"));
    if (port !== null) candidates.add(port);
  }

  try {
    const codex = readBounded(join(getCodexHome(), "config.toml"));
    if (codex) {
      const drift = detectCodexRoutingDrift(codex, { ownPorts: [] });
      if (drift.kind === "foreign") {
        for (const target of drift.targets) {
          if (target.key === "model_providers.opencodex.base_url") candidates.add(target.port);
        }
      }
    }
  } catch { /* an absent or invalid client home is not owner evidence */ }

  for (const port of candidates) {
    const owner = await probePortOwner(port, {}, START_OWNERSHIP_LIVENESS);
    if (owner && Number.isSafeInteger(owner.pid) && owner.pid! > 0 && owner.pid !== process.pid) return port;
  }
  return null;
}

/**
 * Recovery follows the full owner decision; a sibling never replays another home's journal.
 * A marked sibling's owner can be down mid-restart; its journal is still not ours to replay.
 */
export function reconcileStartupJournal(): void {
  if (currentExternalCodexModelProvider() || siblingOfLivePort() !== null) return;
  const clientState = readClientConnectionState();
  reconcileJournal(clientState.kind === "connected"
    ? { activeClientApiKeyId: clientState.value.apiKeyId }
    : undefined);
}
