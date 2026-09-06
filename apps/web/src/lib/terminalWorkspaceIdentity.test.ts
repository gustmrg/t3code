import { ProviderDriverKind, ProviderInstanceId, type TerminalSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { deriveProviderInstanceEntries } from "../providerInstances";
import { terminalWorkspaceIdentity } from "./terminalWorkspaceIdentity";

const providers = new Map(
  deriveProviderInstanceEntries(
    ["codex", "claude"].map((driver) => ({
      instanceId: ProviderInstanceId.make(driver),
      driver: ProviderDriverKind.make(driver),
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    })),
  ).map((entry) => [entry.instanceId, entry]),
);
const binding = { mainTerminalId: "term-1", startup: { _tag: "shell" as const } };
const summary: TerminalSummary = {
  threadId: "thread-1",
  terminalId: "term-1",
  cwd: "/tmp",
  worktreePath: null,
  status: "running",
  pid: 123,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: true,
  label: "codex",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("terminal workspace identity", () => {
  it("identifies a manually started Codex without inventing a model", () => {
    const result = terminalWorkspaceIdentity(binding, summary, providers);
    expect(result.provider?.driverKind).toBe("codex");
    expect(result.label).toContain("Model unavailable");
  });
  it("prefers the current command over an earlier provider launch", () => {
    const result = terminalWorkspaceIdentity(
      binding,
      {
        ...summary,
        agentLaunch: {
          providerInstanceId: ProviderInstanceId.make("claude"),
          displayName: "Claude Code",
          status: "started",
        },
      },
      providers,
    );
    expect(result.provider?.driverKind).toBe("codex");
  });
  it("does not attribute an idle shell to a previously launched provider", () => {
    const result = terminalWorkspaceIdentity(
      {
        ...binding,
        startup: { _tag: "agent", providerInstanceId: ProviderInstanceId.make("claude") },
      },
      {
        ...summary,
        hasRunningSubprocess: false,
        label: "bash",
      },
      providers,
    );
    expect(result).toEqual({ provider: null, label: "bash" });
  });
  it("handles unavailable terminal metadata without using chat defaults", () => {
    expect(terminalWorkspaceIdentity(binding, null, providers)).toEqual({
      provider: null,
      label: "Terminal",
    });
  });
  it("uses the observed Codex model over unrelated launch preferences", () => {
    const result = terminalWorkspaceIdentity(
      {
        ...binding,
        startup: { _tag: "agent", providerInstanceId: ProviderInstanceId.make("claude") },
      },
      {
        ...summary,
        label: "Claude Code",
        agentSession: {
          provider: "codex",
          sessionId: "session-1",
          model: "gpt-5.6-luna",
          state: "working",
        },
      },
      providers,
    );
    expect(result.provider?.driverKind).toBe("codex");
    expect(result.label).toContain("gpt-5.6-luna");
    expect(result.label).not.toContain("Model unavailable");
  });
});
