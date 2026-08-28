import { describe, expect, it } from "vite-plus/test";

import {
  mergeProviderInstanceEnvironment,
  providerInstanceEnvironmentOverrides,
} from "./ProviderInstanceEnvironment.ts";

describe("mergeProviderInstanceEnvironment", () => {
  it("overrides inherited environment values and preserves empty strings", () => {
    expect(
      mergeProviderInstanceEnvironment(
        [
          { name: "OPENROUTER_API_KEY", value: "sk-or-test", sensitive: true },
          { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
        ],
        { ANTHROPIC_API_KEY: "inherited", PATH: "/bin" },
      ),
    ).toMatchObject({
      OPENROUTER_API_KEY: "sk-or-test",
      ANTHROPIC_API_KEY: "",
      PATH: "/bin",
    });
  });
});

describe("providerInstanceEnvironmentOverrides", () => {
  it("returns only explicitly configured instance variables", () => {
    expect(
      providerInstanceEnvironmentOverrides([
        { name: "ANTHROPIC_API_KEY", value: "configured", sensitive: true },
      ]),
    ).toEqual({ ANTHROPIC_API_KEY: "configured" });
  });
});
