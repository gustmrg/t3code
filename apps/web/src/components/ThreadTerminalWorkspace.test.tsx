import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useRightPanelStore } from "../rightPanelStore";

vi.mock("../rightPanelStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../rightPanelStore")>();
  return {
    ...actual,
    useRightPanelStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useRightPanelStore.getState>) => unknown) =>
        selector(actual.useRightPanelStore.getState()),
      actual.useRightPanelStore,
    ),
  };
});
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({ bindings: [], environment: { capabilities: {} } }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../hooks/useLocalStorage", () => ({ useLocalStorage: () => [false] }));
vi.mock("../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../hooks/useTerminalThreadTitle", () => ({
  useTerminalThreadTitle: () => "Terminal fixture",
}));
vi.mock("../state/entities", () => ({
  useThreadShell: () => ({ title: "New thread", projectId: "project", worktreePath: null }),
  useProject: () => ({ workspaceRoot: "/fixture" }),
}));
vi.mock("../state/terminalSessions", () => ({ useKnownTerminalSessions: () => [] }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../keybindings", () => ({ shortcutLabelForCommand: () => null }));
vi.mock("./ThreadTerminalDrawer", () => ({ TerminalViewport: () => <div>PTY</div> }));
vi.mock("./PersistentThreadTerminals", () => ({ PersistentThreadTerminalDrawer: () => null }));
vi.mock("./ThreadWorkspaceTools", () => ({ ThreadWorkspaceTools: () => <div>tools</div> }));
vi.mock("../env", () => ({ isElectron: true }));
import { ThreadTerminalWorkspace } from "./ThreadTerminalWorkspace";
const ref = scopeThreadRef(EnvironmentId.make("test"), ThreadId.make("thread"));
const render = () =>
  renderToStaticMarkup(
    <ThreadTerminalWorkspace
      threadRef={ref}
      binding={{ mainTerminalId: "term-1", startup: { _tag: "shell" } }}
    />,
  );
beforeEach(() =>
  useRightPanelStore.setState({
    byThreadKey: {},
    panelFirstByThreadKey: {},
    manuallyMaximizedByThreadKey: {},
  }),
);
it("places toggles inside the desktop drag header when tools are closed", () => {
  const html = render();
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  expect(header).toContain("drag-region");
  expect(header).toContain('aria-label="Toggle terminal drawer"');
  expect(header).toContain('aria-label="Toggle right panel"');
  expect(header).toContain("[-webkit-app-region:no-drag]");
});
it("keeps controls available when inline tools hide the main header", () => {
  useRightPanelStore.getState().open(ref, "files");
  useRightPanelStore.getState().toggleMaximized(ref);
  const html = render();
  expect(html.indexOf('aria-label="Toggle right panel"')).toBeLessThan(html.indexOf("<header"));
  expect(html.match(/aria-label="Toggle right panel"/g)).toHaveLength(1);
});
