import { describe, expect, it } from "vite-plus/test";

import type { ModelCapabilities } from "@t3tools/contracts";

import {
  applyProviderOptionSelection,
  providerOptionValueLabels,
  resolveProviderOptionDescriptors,
} from "./providerOptions";

const CODEX_CAPABILITIES: ModelCapabilities = {
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [
        { id: "medium", label: "Medium", isDefault: true },
        { id: "high", label: "High" },
      ],
      currentValue: "medium",
    },
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard", isDefault: true },
        { id: "priority", label: "Fast" },
      ],
      currentValue: "default",
    },
  ],
};

const KIMI_CAPABILITIES: ModelCapabilities = {
  optionDescriptors: [
    {
      id: "thinking",
      label: "Thinking",
      type: "select",
      options: [
        { id: "off", label: "Thinking Off" },
        { id: "low", label: "Thinking Low" },
        { id: "high", label: "Thinking High", isDefault: true },
        { id: "max", label: "Thinking Max" },
      ],
      currentValue: "high",
    },
  ],
};

describe("mobile provider options", () => {
  it("keeps the Kimi driver slug alongside negotiated options", () => {
    const snapshot = {
      driver: "kimi",
      models: [{ slug: "kimi-k2.5", capabilities: KIMI_CAPABILITIES }],
    };
    expect(snapshot.driver).toBe("kimi");
    expect(
      resolveProviderOptionDescriptors({
        capabilities: snapshot.models[0]!.capabilities,
        selections: undefined,
      }),
    ).toEqual([expect.objectContaining({ id: "thinking", currentValue: "high" })]);
  });

  it("updates Kimi thinking from its negotiated effort choices", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: KIMI_CAPABILITIES,
      selections: undefined,
    });

    expect(providerOptionValueLabels(descriptors)).toEqual(["Thinking High"]);
    expect(applyProviderOptionSelection(descriptors, { id: "thinking", value: "off" })).toEqual([
      { id: "thinking", value: "off" },
    ]);
    expect(
      applyProviderOptionSelection(descriptors, { id: "thinking", value: "ultra" }),
    ).toBeNull();
  });

  it("summarizes the option values currently in effect", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: CODEX_CAPABILITIES,
      selections: undefined,
    });

    expect(providerOptionValueLabels(descriptors)).toEqual(["Medium", "Standard"]);
  });

  it("updates generic select options without knowing provider-specific ids", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: CODEX_CAPABILITIES,
      selections: undefined,
    });

    expect(
      applyProviderOptionSelection(descriptors, { id: "serviceTier", value: "priority" }),
    ).toEqual([
      { id: "reasoningEffort", value: "medium" },
      { id: "serviceTier", value: "priority" },
    ]);
    // Choices the model doesn't advertise are rejected, not stored.
    expect(
      applyProviderOptionSelection(descriptors, { id: "serviceTier", value: "turbo" }),
    ).toBeNull();
    expect(applyProviderOptionSelection(descriptors, { id: "unknown", value: "high" })).toBeNull();
  });

  it("treats an unspecified boolean capability as off", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: {
        optionDescriptors: [{ id: "fastMode", label: "Fast Mode", type: "boolean" }],
      },
      selections: undefined,
    });

    expect(providerOptionValueLabels(descriptors)).toEqual([]);
    expect(applyProviderOptionSelection(descriptors, { id: "fastMode", value: true })).toEqual([
      { id: "fastMode", value: true },
    ]);
  });
});
