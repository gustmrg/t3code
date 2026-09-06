import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useComposerDraftStore } from "../composerDraftStore";
import { useTerminalPreparationStore } from "../terminalPreparationStore";

const harness = vi.hoisted(() => {
  const state = { location: { href: "/" }, matches: [{ params: {} as Record<string, string> }] };
  return {
    state,
    navigate: vi.fn(async (target: { to: string; params: Record<string, string> }) => {
      state.location = { href: target.to };
      state.matches = [{ params: target.params }];
    }),
    project: {} as Record<string, unknown>,
    config: {} as Record<string, unknown>,
    materialize: vi.fn(),
    open: vi.fn(),
    wait: vi.fn(),
    toast: vi.fn(),
  };
});
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => harness.config.settings }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: harness.state, navigate: harness.navigate }),
}));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: { get: () => harness.config } }));
vi.mock("../state/server", () => ({
  primaryServerSettingsAtom: {},
  primaryServerConfigAtom: {},
  serverEnvironment: { configValueAtom: () => ({}) },
}));
vi.mock("../state/entities", () => ({
  useProjects: () => [harness.project],
  readThreadShell: () => null,
  waitForProject: async () => harness.project,
  waitForThreadShell: (...args: unknown[]) => harness.wait(...args),
}));
vi.mock("../state/threads", () => ({ threadEnvironment: { materialize: "materialize" } }));
vi.mock("../state/terminal", () => ({ terminalEnvironment: { open: "open" } }));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: string) =>
    command === "materialize" ? harness.materialize : harness.open,
}));
vi.mock("./useSettings", () => ({ useClientSettings: () => ({}) }));
vi.mock("../logicalProject", () => ({
  deriveLogicalProjectKeyFromSettings: () => "project",
  selectProjectGroupingSettings: () => ({}),
}));
vi.mock("../components/Sidebar.logic", () => ({ orderItemsByPreferredIds: () => [] }));
vi.mock("../components/ui/toast", () => ({
  toastManager: { add: (...args: unknown[]) => harness.toast(...args) },
  stackedThreadToast: (value: unknown) => value,
}));
vi.mock("../rightPanelStore", () => ({
  useRightPanelStore: { getState: () => ({ openTerminal: vi.fn(), setPanelFirst: vi.fn() }) },
}));

import { useNewThreadHandler } from "./useHandleNewThread";
const projectRef = scopeProjectRef(EnvironmentId.make("remote"), ProjectId.make("project"));
function handler() {
  let start!: ReturnType<typeof useNewThreadHandler>;
  function Harness() {
    start = useNewThreadHandler();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return start;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("new thread experience before navigation", () => {
  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadKey: {},
      draftThreadsByThreadKey: {},
      logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    });
    useTerminalPreparationStore.setState({ byThread: {} });
    harness.state.location = { href: "/" };
    harness.state.matches = [{ params: {} }];
    harness.navigate.mockClear();
    harness.toast.mockClear();
    harness.materialize.mockReset();
    harness.open.mockReset();
    harness.wait.mockReset();
    harness.project = {
      id: projectRef.projectId,
      environmentId: projectRef.environmentId,
      workspaceRoot: "/repo",
      defaultThreadEnvMode: "local",
    };
    harness.config = {
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        defaultThreadView: "terminal",
        terminalStartup: { _tag: "shell" },
      },
      providers: [],
      environment: { capabilities: { terminalWorkspaceSessions: true } },
    };
  });

  it("records Terminal before navigation and holds preparation until the PTY opens", async () => {
    const materialized = deferred<{ _tag: "Success"; value: { sequence: number } }>();
    const materializeStarted = deferred<void>();
    harness.materialize.mockImplementation(() => {
      materializeStarted.resolve();
      return materialized.promise;
    });
    const opened = deferred<{ _tag: "Success"; value: object }>();
    const openStarted = deferred<void>();
    harness.wait.mockImplementation(async (ref) => ({
      id: ref.threadId,
      worktreePath: null,
      terminalWorkspace: { mainTerminalId: "term-1", startup: { _tag: "shell" } },
    }));
    harness.open.mockImplementation(() => {
      openStarted.resolve();
      return opened.promise;
    });
    harness.navigate.mockImplementationOnce(async (target) => {
      expect(
        useComposerDraftStore.getState().draftThreadsByThreadKey[target.params.draftId!]
          ?.launchView,
      ).toBe("terminal");
      harness.state.location = { href: target.to };
      harness.state.matches = [{ params: target.params }];
    });
    const launch = handler()(projectRef);
    await materializeStarted.promise;
    const draftId = harness.state.matches[0]!.params.draftId!;
    expect(useComposerDraftStore.getState().draftThreadsByThreadKey[draftId]?.launchView).toBe(
      "terminal",
    );
    expect(Object.values(useTerminalPreparationStore.getState().byThread)).toEqual([
      { status: "preparing" },
    ]);
    materialized.resolve({ _tag: "Success", value: { sequence: 42 } });
    await openStarted.promise;
    expect(harness.wait).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: "remote" }),
      42,
      expect.any(AbortSignal),
    );
    expect(harness.navigate).toHaveBeenCalledTimes(1);
    harness.state.location = { href: "/remote/other" };
    harness.state.matches = [{ params: { environmentId: "remote", threadId: "other" } }];
    opened.resolve({ _tag: "Success", value: {} });
    await launch;
    expect(harness.navigate).toHaveBeenCalledTimes(1);
    expect(harness.materialize).toHaveBeenCalledOnce();
  });

  it("applies the current preference when reusing an empty Chat draft", async () => {
    await handler()(projectRef, { forceChat: true });
    const draftId = harness.state.matches[0]!.params.draftId!;
    harness.materialize.mockRejectedValue(new Error("offline"));
    await handler()(projectRef);
    expect(useComposerDraftStore.getState().draftThreadsByThreadKey[draftId]?.launchView).toBe(
      "terminal",
    );
    expect(harness.materialize).toHaveBeenCalledOnce();
  });

  it("coalesces racing creations without losing the terminal draft", async () => {
    const materialized = deferred<{ _tag: "Success"; value: { sequence: number } }>();
    const started = deferred<void>();
    harness.materialize.mockImplementation(() => {
      started.resolve();
      return materialized.promise;
    });
    harness.wait.mockImplementation(async (ref) => ({
      id: ref.threadId,
      worktreePath: null,
      terminalWorkspace: { mainTerminalId: "term-1", startup: { _tag: "shell" } },
    }));
    harness.open.mockResolvedValue({ _tag: "Success", value: {} });
    const start = handler();
    const first = start(projectRef);
    const second = start(projectRef);
    await started.promise;
    materialized.resolve({ _tag: "Success", value: { sequence: 1 } });
    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual(results[1]);
    expect(harness.materialize).toHaveBeenCalledOnce();
    expect(harness.open).toHaveBeenCalledOnce();
  });

  it("falls back to Shell when the configured provider is unavailable", async () => {
    harness.config.settings = {
      ...DEFAULT_SERVER_SETTINGS,
      defaultThreadView: "terminal",
      terminalStartup: { _tag: "agent", providerInstanceId: "unavailable" },
    };
    harness.materialize.mockRejectedValue(new Error("offline"));
    await handler()(projectRef);
    expect(harness.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          terminalWorkspace: expect.objectContaining({ startup: { _tag: "shell" } }),
        }),
      }),
    );
    expect(Object.values(useTerminalPreparationStore.getState().byThread)).toEqual([
      { status: "failed", message: "offline" },
    ]);
  });

  it.each(["forceChat", "unsupported", "projectChat"])(
    "resolves %s to Chat before navigating",
    async (scenario) => {
      if (scenario === "unsupported")
        harness.config.environment = { capabilities: { terminalWorkspaceSessions: false } };
      if (scenario === "projectChat")
        harness.project.threadLaunchPreference = { defaultThreadView: "chat" };
      await handler()(projectRef, scenario === "forceChat" ? { forceChat: true } : undefined);
      const draftId = harness.state.matches[0]!.params.draftId!;
      expect(useComposerDraftStore.getState().draftThreadsByThreadKey[draftId]?.launchView).toBe(
        "chat",
      );
      expect(harness.materialize).not.toHaveBeenCalled();
      if (scenario === "unsupported") expect(harness.toast).toHaveBeenCalledOnce();
    },
  );
});
