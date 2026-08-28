import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildTerminalMaterializeInput,
  coordinateTerminalFirstLaunch,
  type LaunchStepResult,
} from "./newThreadLaunch";

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.6-sol",
};

function materializeInput(
  overrides: Partial<Parameters<typeof buildTerminalMaterializeInput>[0]> = {},
) {
  return buildTerminalMaterializeInput({
    threadId: ThreadId.make("thread-a"),
    projectId: ProjectId.make("project-a"),
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    envMode: "local",
    projectCwd: "/repo",
    branch: null,
    worktreePath: null,
    startFromOrigin: false,
    randomHex: () => "abcd1234",
    ...overrides,
  });
}

describe("buildTerminalMaterializeInput", () => {
  it("keeps current-checkout mode in the project workspace", () => {
    expect(materializeInput()).toEqual({
      threadId: "thread-a",
      projectId: "project-a",
      title: "New thread",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
    });
  });

  it("provisions worktree mode from the selected branch", () => {
    expect(
      materializeInput({ envMode: "worktree", branch: "main", startFromOrigin: true }),
    ).toMatchObject({
      prepareWorktree: {
        projectCwd: "/repo",
        baseBranch: "main",
        branch: "t3code/abcd1234",
        startFromOrigin: true,
      },
      runSetupScript: true,
    });
  });

  it("uses HEAD when terminal-first has no branch picker state yet", () => {
    expect(materializeInput({ envMode: "worktree" })).toMatchObject({
      prepareWorktree: { baseBranch: "HEAD" },
    });
  });
});

describe("coordinateTerminalFirstLaunch", () => {
  const ref = scopeThreadRef(
    "remote-environment" as EnvironmentId,
    ThreadId.make("terminal-thread"),
  );
  const shell = {
    id: ref.threadId,
    worktreePath: "/repo-worktree",
  } as OrchestrationThreadShell;

  function operations(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    return {
      calls,
      value: {
        materialize: vi.fn(async () => {
          calls.push("materialize");
          return { _tag: "Success", value: undefined } as const;
        }),
        waitForThreadShell: vi.fn(async () => {
          calls.push("wait-shell");
          return shell;
        }),
        navigateToThread: vi.fn(async (threadRef) => {
          calls.push(`navigate:${threadRef.environmentId}`);
        }),
        terminalInput: vi.fn(() => ({
          threadId: ref.threadId,
          terminalId: "term-1",
          cwd: "/repo-worktree",
        })),
        openTerminal: vi.fn(async () => {
          calls.push("open-terminal");
          return { _tag: "Success", value: undefined } as const;
        }),
        activateTerminalWorkspace: vi.fn(() => calls.push("activate")),
        restoreChatWorkspace: vi.fn(() => calls.push("restore-chat")),
        ...overrides,
      },
    };
  }

  it("materializes remotely, navigates, opens the PTY, then activates panel-first", async () => {
    const ops = operations();
    await expect(
      coordinateTerminalFirstLaunch({
        threadRef: ref,
        materializeInput: { threadId: ref.threadId },
        operations: ops.value,
      }),
    ).resolves.toEqual({ _tag: "Success" });
    expect(ops.calls).toEqual([
      "materialize",
      "wait-shell",
      "navigate:remote-environment",
      "open-terminal",
      "activate",
    ]);
  });

  it("does not navigate when materialization fails", async () => {
    const ops = operations({
      materialize: async () => ({ _tag: "Failure", error: new Error("create failed") }),
    });
    const result = await coordinateTerminalFirstLaunch({
      threadRef: ref,
      materializeInput: { threadId: ref.threadId },
      operations: ops.value,
    });
    expect(result._tag).toBe("MaterializeFailure");
    expect(ops.value.navigateToThread).not.toHaveBeenCalled();
  });

  it("restores chat on terminal failure and exposes a working retry", async () => {
    let attempts = 0;
    const ops = operations({
      openTerminal: async (): Promise<LaunchStepResult<unknown>> => {
        attempts += 1;
        return attempts === 1
          ? { _tag: "Failure", error: new Error("pty failed") }
          : { _tag: "Success", value: undefined };
      },
    });
    const result = await coordinateTerminalFirstLaunch({
      threadRef: ref,
      materializeInput: { threadId: ref.threadId },
      operations: ops.value,
    });
    expect(result._tag).toBe("TerminalFailure");
    expect(ops.value.restoreChatWorkspace).toHaveBeenCalledOnce();
    if (result._tag !== "TerminalFailure") throw new Error("expected terminal failure");
    await expect(result.retry()).resolves.toEqual({ _tag: "Success", value: undefined });
    expect(ops.value.activateTerminalWorkspace).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent launches for the same scoped thread", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ops = operations({
      materialize: vi.fn(async () => {
        await gate;
        return { _tag: "Success", value: undefined } as const;
      }),
    });
    const first = coordinateTerminalFirstLaunch({
      threadRef: ref,
      materializeInput: { threadId: ref.threadId },
      operations: ops.value,
    });
    const second = coordinateTerminalFirstLaunch({
      threadRef: ref,
      materializeInput: { threadId: ref.threadId },
      operations: ops.value,
    });
    expect(second).toBe(first);
    release?.();
    await Promise.all([first, second]);
    expect(ops.value.materialize).toHaveBeenCalledOnce();
  });
});
