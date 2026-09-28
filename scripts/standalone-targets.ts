/**
 * Standalone binary target metadata — the single source for the standalone build
 * matrix. scripts/build-standalone.ts builds from this list, the release workflow's
 * package-standalone matrix must stay equal to it, and the pre-publication
 * verifier derives its expected standalone assets from it.
 */
export const standaloneTargets = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-windows-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
] as const;

export function isStandaloneTarget(value: string): boolean {
  return (standaloneTargets as readonly string[]).includes(value);
}

export function standaloneExecutableName(target: string): string {
  return target.startsWith("bun-windows-") ? "ocx.exe" : "ocx";
}

export function standaloneArchiveExtension(target: string): string {
  return target.startsWith("bun-windows-") ? "zip" : "tar.gz";
}

export function standaloneArchiveName(version: string, target: string): string {
  return `ocx-${version}-${target}.${standaloneArchiveExtension(target)}`;
}

/**
 * The `@napi-rs/keyring` platform package a target's binary must embed (#6139). `bun build
 * --compile` bundles only the optional native packages installed in node_modules, and a plain
 * `bun install` installs only the host's. A cross-architecture target (darwin-x64 on an arm64
 * runner, linux-arm64 on an x64 runner) therefore compiled without its OS credential store unless
 * the build refuses first.
 */
const keyringPackageByTarget: Record<(typeof standaloneTargets)[number], string> = {
  "bun-darwin-arm64": "@napi-rs/keyring-darwin-arm64",
  "bun-darwin-x64": "@napi-rs/keyring-darwin-x64",
  "bun-windows-x64": "@napi-rs/keyring-win32-x64-msvc",
  "bun-linux-x64": "@napi-rs/keyring-linux-x64-gnu",
  "bun-linux-arm64": "@napi-rs/keyring-linux-arm64-gnu",
};

export function standaloneKeyringPackage(target: string): string {
  const name = keyringPackageByTarget[target as (typeof standaloneTargets)[number]];
  if (!name) throw new Error(`No @napi-rs/keyring package is known for standalone target ${target}`);
  return name;
}
