import { describe, expect, it } from "vite-plus/test";
import { resolveEnvironmentIdentificationPillLabel } from "./EnvironmentIdentification";

describe("environment identification pill", () => {
  it.each(["Dev", "Nightly", "Alpha", "Latest"])("always identifies %s", (label) => {
    expect(resolveEnvironmentIdentificationPillLabel(label.toLowerCase())).toBe(label);
  });
  it("preserves other environment labels", () => {
    expect(resolveEnvironmentIdentificationPillLabel(" Preview ")).toBe("Preview");
  });
});
