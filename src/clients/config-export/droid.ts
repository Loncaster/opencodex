import { win32, join } from "node:path";
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
