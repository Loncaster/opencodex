import { expect, test } from "bun:test";
import { KIRO_MODEL_CONTEXT_WINDOWS } from "../../../src/providers/kiro-models";
import { PROVIDER_REGISTRY } from "../../../src/providers/registry";

test("Kiro does not advertise Sonnet 5.5 before the provider publishes support", () => {
  const kiro = PROVIDER_REGISTRY.find(provider => provider.id === "kiro")!;
  expect(kiro.liveModels).toBe(false);
  expect(kiro.models ?? []).not.toContain("claude-sonnet-5.5");
  expect(KIRO_MODEL_CONTEXT_WINDOWS["claude-sonnet-5.5"]).toBeUndefined();
});
