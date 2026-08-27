import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  selectableTerminalStartupProviders,
  terminalStartupFromSelection,
  terminalStartupSelectionValue,
  unavailableTerminalStartupProviderId,
} from "./threadLaunchSettings.ts";

const codex = ProviderInstanceId.make("codex");
const missing = ProviderInstanceId.make("missing_agent");

describe("terminal launch settings", () => {
  it("round-trips shell and provider selections", () => {
    expect(terminalStartupFromSelection(terminalStartupSelectionValue({ _tag: "shell" }))).toEqual({
      _tag: "shell",
    });
    expect(
      terminalStartupFromSelection(
        terminalStartupSelectionValue({ _tag: "agent", providerInstanceId: codex }),
      ),
    ).toEqual({ _tag: "agent", providerInstanceId: codex });
  });

  it("offers only enabled, available providers for new selections", () => {
    const entries = [
      { instanceId: codex, enabled: true, isAvailable: true },
      { instanceId: missing, enabled: true, isAvailable: false },
    ];
    expect(selectableTerminalStartupProviders(entries)).toEqual([entries[0]]);
  });

  it("preserves a stale selection for a recoverable warning", () => {
    expect(
      unavailableTerminalStartupProviderId({ _tag: "agent", providerInstanceId: missing }, [
        { instanceId: codex, enabled: true, isAvailable: true },
      ]),
    ).toBe(missing);
  });
});
