import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { dispatchWorkspaceAction, subscribeWorkspaceAction } from "./workspaceActionBus";

describe("workspaceActionBus", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers typed workspace actions and unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWorkspaceAction(listener);

    dispatchWorkspaceAction("open-terminal");
    dispatchWorkspaceAction("restore-chat");
    expect(listener.mock.calls.map(([action]) => action)).toEqual([
      "open-terminal",
      "restore-chat",
    ]);

    unsubscribe();
    dispatchWorkspaceAction("open-files");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores unknown window events", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWorkspaceAction(listener);
    window.dispatchEvent(new CustomEvent("t3code:workspace-action", { detail: "unknown" }));
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });
});
