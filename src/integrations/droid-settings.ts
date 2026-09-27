/** Read-only guard for competing Factory settings before a managed write. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { join, win32 } from "node:path";

const isWindowsRoot = (path: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(path);

/** Other Factory settings can take priority over the managed personal rows. */
export function assertDroidSettingsUnambiguous(root: string): void {
  try {
    const directory = lstatSync(root);
    if (!directory.isDirectory()) throw new Error("Unsafe Factory settings directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const name of ["config.json", "settings.local.json"]) {
    const path = isWindowsRoot(root) ? win32.join(root, name) : join(root, name);
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
