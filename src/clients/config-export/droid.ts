import { win32, join } from "node:path";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { exportPresentationLabel } from "../model-presentation";
import type { ExportContext, ManagedContribution, OpencodeLaunchEnv } from "./contracts";
import { normalizeExportModels } from "./model-metadata";
import { formatSelectorConjunction } from "../../integrations/merge";

/** Factory personal settings: https://docs.factory.ai/model-independence/byok */
export interface DroidModelEntry {
  model: string;
  displayName: string;
  baseUrl: string;
  provider: "generic-chat-completion-api";
  noImageSupport: boolean;
}

export interface DroidGeneratedConfig { customModels: DroidModelEntry[] }

const isWindowsHome = (home: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(home);

export function droidHomeDir(_env: OpencodeLaunchEnv = process.env, home: string = homedir()): string {
  return isWindowsHome(home) ? win32.join(home, ".factory") : join(home, ".factory");
}

export function droidConfigPath(env: OpencodeLaunchEnv = process.env, home: string = homedir()): string {
  const root = droidHomeDir(env, home);
  return isWindowsHome(root) ? win32.join(root, "settings.json") : join(root, "settings.json");
}

/** Other Factory settings can take priority over the managed personal rows. */
export function assertDroidSettingsUnambiguous(root: string): void {
  try {
    const directory = lstatSync(root);
    if (!directory.isDirectory()) throw new Error("Unsafe Factory settings directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const name of ["config.json", "settings.local.json"]) {
    const path = isWindowsHome(root) ? win32.join(root, name) : join(root, name);
    let stat: ReturnType<typeof lstatSync>;
    try { stat = lstatSync(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error(`Cannot inspect Factory ${name}`);
    }
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error(`Unsafe Factory ${name}`);
    let value: unknown;
    let fd: number | undefined;
    try {
      fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.size > 1024 * 1024 || opened.ino !== stat.ino || opened.dev !== stat.dev) {
        throw new Error("file changed during inspection");
      }
      value = JSON.parse(readFileSync(fd, "utf8"));
    } catch { throw new Error(`Cannot safely parse Factory ${name}`); }
    finally { if (fd !== undefined) closeSync(fd); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Unsafe Factory ${name}`);
    const rows = name === "config.json"
      ? (value as Record<string, unknown>).custom_models
      : (value as Record<string, unknown>).customModels;
    if (name === "settings.local.json" && rows !== undefined) {
      throw new Error("Factory settings.local.json overrides customModels; resolve its precedence before enabling Droid");
    }
    if (name === "config.json" && Array.isArray(rows) && rows.some(row =>
      row && typeof row === "object" && typeof row.display_name === "string"
      && row.display_name.startsWith("OpenCodex:"))) {
      throw new Error("Factory config.json already defines OpenCodex models; resolve its precedence before enabling Droid");
    }
  }
}

export function buildDroidClientConfig(ctx: ExportContext): DroidGeneratedConfig {
  return {
    customModels: normalizeExportModels(ctx.models).map(model => ({
      model: model.namespaced,
      displayName: `OpenCodex: ${exportPresentationLabel(model)}`,
      baseUrl: ctx.baseUrl,
      provider: "generic-chat-completion-api" as const,
      noImageSupport: !model.inputModalities?.includes("image"),
    })),
  };
}

export function summarizeDroid(document: unknown) {
  const rows = (document as DroidGeneratedConfig | undefined)?.customModels;
  const count = Array.isArray(rows) ? rows.length : 0;
  // Droid's personal schema has no context-window field.
  return { modelCount: count, modelsWithoutLimits: count };
}

export function buildDroidContribution(ctx: ExportContext): ManagedContribution {
  const rows = buildDroidClientConfig(ctx).customModels;
  return {
    clientId: "droid",
    fragments: rows.map(row => {
      const selector = formatSelectorConjunction([
        { field: "model", value: row.model },
        { field: "baseUrl", value: row.baseUrl },
      ]);
      if (!selector) throw new Error("Droid model selector cannot safely represent this model");
      return { path: ["customModels", selector], value: row };
    }),
  };
}
