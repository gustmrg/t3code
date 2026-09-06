import { EnvironmentId, ThreadId, type OrchestrationShellSnapshot } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { waitForThreadShellReceipt } from "./threadShellReceipt";

const ref = { environmentId: EnvironmentId.make("remote"), threadId: ThreadId.make("thread") };
function harness(sequence = 11, worktreePath: string | null = null) {
  let snapshot = {
    snapshotSequence: sequence,
    threads: [{ id: ref.threadId, worktreePath }],
  } as unknown as OrchestrationShellSnapshot;
  let error: string | null = null;
  let removed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    input: {
      ref,
      sequence: 12,
      read: () => ({ snapshot, error, removed }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    listeners,
    update: (next: Partial<OrchestrationShellSnapshot>) => {
      snapshot = { ...snapshot, ...next };
      notify();
    },
    fail: () => {
      error = "Stream failed";
      notify();
    },
    remove: () => {
      removed = true;
      notify();
    },
  };
}
describe("thread shell materialization receipt", () => {
  it("waits for the final coalesced snapshot, reading cwd and sequence together", async () => {
    const h = harness();
    const opened = vi.fn();
    const wait = waitForThreadShellReceipt(h.input).then(opened);
    await Promise.resolve();
    expect(opened).not.toHaveBeenCalled();
    h.update({
      snapshotSequence: 14,
      threads: [
        { id: ref.threadId, worktreePath: "/worktree" },
      ] as unknown as OrchestrationShellSnapshot["threads"],
    });
    await wait;
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: "/worktree" }));
    expect(h.listeners.size).toBe(0);
  });
  it("accepts an already applied local receipt", async () => {
    const h = harness(12);
    await expect(waitForThreadShellReceipt(h.input)).resolves.toMatchObject({ worktreePath: null });
    expect(h.listeners.size).toBe(0);
  });
  it("closes the subscription race", async () => {
    const h = harness();
    await expect(
      waitForThreadShellReceipt({
        ...h.input,
        subscribe: (listener) => {
          h.update({ snapshotSequence: 12 });
          return h.input.subscribe(listener);
        },
      }),
    ).resolves.toMatchObject({ id: ref.threadId });
    expect(h.listeners.size).toBe(0);
  });
  it.each(["cancel", "error", "thread", "environment"])("cleans up on %s", async (reason) => {
    const h = harness();
    const controller = new AbortController();
    const wait = waitForThreadShellReceipt({ ...h.input, signal: controller.signal });
    const rejected = expect(wait).rejects.toThrow();
    if (reason === "cancel") controller.abort();
    if (reason === "error") h.fail();
    if (reason === "thread") h.update({ snapshotSequence: 12, threads: [] });
    if (reason === "environment") h.remove();
    await rejected;
    expect(h.listeners.size).toBe(0);
  });
  it("does not observe a different environment with the same thread ID", async () => {
    const h = harness();
    const other = harness(99, "/wrong");
    const opened = vi.fn();
    const wait = waitForThreadShellReceipt(h.input).then(opened);
    other.update({ snapshotSequence: 100 });
    await Promise.resolve();
    expect(opened).not.toHaveBeenCalled();
    h.update({ snapshotSequence: 12 });
    await wait;
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: null }));
  });
});

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { resolveThreadDetailRef } from "./entities";
const threadRef = scopeThreadRef(EnvironmentId.make("environment-1"), ThreadId.make("thread-1"));

describe("resolveThreadDetailRef", () => {
  it("does not subscribe to a reserved draft thread before it enters the shell index", () => {
    expect(
      resolveThreadDetailRef(threadRef, {
        shellExists: false,
        waitForShell: true,
      }),
    ).toBeNull();
  });

  it("subscribes once the reserved draft thread enters the shell index", () => {
    expect(
      resolveThreadDetailRef(threadRef, {
        shellExists: true,
        waitForShell: true,
      }),
    ).toBe(threadRef);
  });

  it("keeps direct server-thread lookups enabled when the shell has not loaded it", () => {
    expect(
      resolveThreadDetailRef(threadRef, {
        shellExists: false,
        waitForShell: false,
      }),
    ).toBe(threadRef);
  });
});
