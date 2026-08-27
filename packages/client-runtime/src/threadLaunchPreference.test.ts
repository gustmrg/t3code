import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveThreadLaunchPreference } from "./threadLaunchPreference.ts";

const codex = ProviderInstanceId.make("codex");
const claude = ProviderInstanceId.make("claude_personal");

describe("resolveThreadLaunchPreference", () => {
  it("uses chat and shell defaults", () => {
    expect(
      resolveThreadLaunchPreference({
        application: { defaultThreadView: "chat", terminalStartup: { _tag: "shell" } },
        terminalWorkspaceSupported: true,
        availableProviderInstanceIds: [],
      }),
    ).toEqual({ view: "chat", terminalStartup: { _tag: "shell" }, fallback: null });
  });

  it("lets a project override the application view and inherit terminal startup", () => {
    expect(
      resolveThreadLaunchPreference({
        application: {
          defaultThreadView: "chat",
          terminalStartup: { _tag: "agent", providerInstanceId: codex },
        },
        projectOverride: { defaultThreadView: "terminal" },
        terminalWorkspaceSupported: true,
        availableProviderInstanceIds: [codex],
      }),
    ).toEqual({
      view: "terminal",
      terminalStartup: { _tag: "agent", providerInstanceId: codex },
      fallback: null,
    });
  });

  it("lets a project override terminal startup", () => {
    expect(
      resolveThreadLaunchPreference({
        application: {
          defaultThreadView: "terminal",
          terminalStartup: { _tag: "agent", providerInstanceId: codex },
        },
        projectOverride: {
          defaultThreadView: "terminal",
          terminalStartup: { _tag: "agent", providerInstanceId: claude },
        },
        terminalWorkspaceSupported: true,
        availableProviderInstanceIds: [codex, claude],
      }).terminalStartup,
    ).toEqual({ _tag: "agent", providerInstanceId: claude });
  });

  it("falls back to chat on clients without terminal workspace support", () => {
    expect(
      resolveThreadLaunchPreference({
        application: { defaultThreadView: "terminal", terminalStartup: { _tag: "shell" } },
        terminalWorkspaceSupported: false,
        availableProviderInstanceIds: [],
      }),
    ).toEqual({
      view: "chat",
      terminalStartup: { _tag: "shell" },
      fallback: { _tag: "terminal-unsupported" },
    });
  });

  it("keeps a stale provider identifiable while falling back to shell", () => {
    expect(
      resolveThreadLaunchPreference({
        application: {
          defaultThreadView: "terminal",
          terminalStartup: { _tag: "agent", providerInstanceId: claude },
        },
        terminalWorkspaceSupported: true,
        availableProviderInstanceIds: [codex],
      }),
    ).toEqual({
      view: "terminal",
      terminalStartup: { _tag: "shell" },
      fallback: { _tag: "provider-unavailable", providerInstanceId: claude },
    });
  });
});
