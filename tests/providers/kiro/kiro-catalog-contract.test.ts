import { expect, test } from "bun:test";
import { KIRO_MODEL_CONTEXT_WINDOWS } from "../../../src/providers/kiro-models";
import { PROVIDER_REGISTRY } from "../../../src/providers/registry";

test("Kiro does not advertise models absent from the provider catalog", () => {
  const kiro = PROVIDER_REGISTRY.find(provider => provider.id === "kiro")!;
  expect(kiro.liveModels).toBe(false);
  for (const id of ["gpt-6-sol", "gpt-6-luna", "claude-opus-5.5", "claude-sonnet-5.5"]) {
    expect(kiro.models ?? []).not.toContain(id);
    expect(KIRO_MODEL_CONTEXT_WINDOWS[id]).toBeUndefined();
  }
});
