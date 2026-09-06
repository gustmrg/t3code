import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
const state = vi.hoisted(() => ({
  shell: null as null | { terminalWorkspace?: object },
  chat: vi.fn(() => <div>chat</div>),
  terminal: vi.fn(() => <div>main terminal</div>),
}));
vi.mock("../state/entities", () => ({ useThreadShell: () => state.shell }));
vi.mock("./ChatView", () => ({ default: state.chat }));
vi.mock("./ThreadTerminalWorkspace", () => ({ ThreadTerminalWorkspace: state.terminal }));
vi.mock("./TerminalPreparation", () => ({ WorkspaceLoading: () => <div>Loading workspace</div> }));
import { ThreadWorkspace } from "./ThreadWorkspace";
const render = () =>
  renderToStaticMarkup(
    <ThreadWorkspace
      routeKind="server"
      environmentId={EnvironmentId.make("remote")}
      threadId={ThreadId.make("thread")}
    />,
  );
beforeEach(() => {
  state.chat.mockClear();
  state.terminal.mockClear();
});
it("waits for metadata without mounting chat", () => {
  state.shell = null;
  expect(render()).toContain("Loading workspace");
  expect(state.chat).not.toHaveBeenCalled();
});
it("uses the durable binding to choose the terminal before chat hooks mount", () => {
  state.shell = {
    terminalWorkspace: { mainTerminalId: "custom-main", startup: { _tag: "shell" } },
  };
  expect(render()).toContain("main terminal");
  expect(state.chat).not.toHaveBeenCalled();
  expect(state.terminal).toHaveBeenCalledOnce();
});
it("keeps chat threads on the traditional composition", () => {
  state.shell = {};
  expect(render()).toContain("chat");
  expect(state.terminal).not.toHaveBeenCalled();
});
