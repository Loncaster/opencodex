import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoPath } from "../helpers/repo-root";
import { removeTreeWithRetry } from "../helpers/remove-tree";

// #6139: the desktop-bundled ocx reported "Cannot find module '@napi-rs/keyring'" because the
// addon was loaded through createRequire(import.meta.url), which hides the specifier from
// `bun build --compile`. The compiled binary then looked the package up on disk at runtime and
// found nothing from any directory without node_modules. This compiles the real loader into a
// standalone executable and runs it from a scratch directory, which is the user's situation.
const scratch = mkdtempSync(join(tmpdir(), "ocx-keyring-compile-"));
afterAll(() => removeTreeWithRetry(scratch));

describe("standalone keyring binding", () => {
  test("a compiled binary loads @napi-rs/keyring from outside the repository", () => {
    const entry = join(scratch, "harness.ts");
    const loader = JSON.stringify(repoPath("src", "providers", "api-key-resolve.ts"));
    writeFileSync(entry, `import { loadProviderKeyringModule } from ${loader};\nconsole.log(typeof loadProviderKeyringModule().Entry);\n`);
    const executable = join(scratch, process.platform === "win32" ? "harness.exe" : "harness");
    const built = Bun.spawnSync([process.execPath, "build", "--compile", entry, "--outfile", executable], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(built.stderr.toString()).not.toContain("error:");
    expect(built.exitCode).toBe(0);
    if (process.platform === "darwin") {
      // Same reseal build-standalone.ts applies: Bun's linker signature can fail page validation.
      expect(Bun.spawnSync(["/usr/bin/codesign", "--force", "--sign", "-", executable]).exitCode).toBe(0);
    }
    const run = Bun.spawnSync([executable], { cwd: scratch, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString().trim()).toBe("function");
    expect(run.exitCode).toBe(0);
  }, 120_000);
});
