import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  focusMainTerminal,
  closeWorkspaceSurfaces,
  moveAuxiliaryTerminalsToDrawer,
} from "./terminalWorkspaceActions";
import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
const ref = { environmentId: EnvironmentId.make("a"), threadId: ThreadId.make("t") };
const binding = { mainTerminalId: "term-7", startup: { _tag: "shell" as const } };
const state = () => selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref);
beforeEach(() =>
  useRightPanelStore.setState({
    byThreadKey: {},
    panelFirstByThreadKey: {},
    manuallyMaximizedByThreadKey: {},
  }),
);
describe("main terminal workspace actions", () => {
  it("reconstructs the principal and focuses the same resource on repeated toggle/palette intents", () => {
    const focus = vi.fn();
    for (let i = 0; i < 3; i++)
      focusMainTerminal({
        ref,
        binding,
        ensure: useRightPanelStore.getState().ensureMainTerminal,
        focus,
      });
    expect(focus).toHaveBeenCalledTimes(3);
    expect(state().surfaces).toHaveLength(1);
    expect(state().activeSurfaceId).toBe("terminal:term-7");
    useRightPanelStore.getState().openFile(ref, "file.ts");
    useRightPanelStore.getState().ensureMainTerminal(ref, binding.mainTerminalId);
    expect(state().activeSurfaceId).toBe("file:file.ts");
    expect(state().surfaces[0]?.id).toBe("terminal:term-7");
  });
  it("can hide the workspace, add another shell, and return to the same main terminal", () => {
    const store = useRightPanelStore.getState();
    store.ensureMainTerminal(ref, binding.mainTerminalId);
    store.toggleVisibility(ref);
    expect(state().isOpen).toBe(false);
    store.openTerminal(ref, "term-8");
    expect(state().isOpen).toBe(true);
    expect(state().activeSurfaceId).toBe("terminal:term-8");
    focusMainTerminal({ ref, binding, ensure: store.ensureMainTerminal, focus: vi.fn() });
    expect(state().activeSurfaceId).toBe("terminal:term-7");
    expect(state().surfaces).toHaveLength(2);
  });
  it("moves auxiliary tabs into the drawer while preserving the main and file surfaces", () => {
    const store = useRightPanelStore.getState();
    const drawer = useTerminalUiStateStore.getState();
    drawer.removeTerminalUiState(ref);
    store.ensureMainTerminal(ref, binding.mainTerminalId);
    store.openTerminal(ref, "term-8");
    store.splitTerminal(ref, "terminal:term-8", "term-9", "horizontal");
    store.openFile(ref, "file.ts");
    const move = vi.fn((id: string) => drawer.ensureTerminal(ref, id));
    const migrate = () =>
      moveAuxiliaryTerminalsToDrawer({
        surfaces: state().surfaces,
        binding,
        move,
        removeSurface: (surface) => store.closeSurface(ref, surface.id),
      });
    migrate();
    migrate();
    expect(move.mock.calls.map(([id]) => id)).toEqual(["term-8", "term-9"]);
    expect(
      selectThreadTerminalUiState(
        useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
        ref,
      ).terminalIds,
    ).toEqual(["term-8", "term-9"]);
    expect(state().surfaces.map((surface) => surface.id)).toEqual([
      "terminal:term-7",
      "file:file.ts",
    ]);
    expect(state().activeSurfaceId).toBe("file:file.ts");
  });
  it("filters the principal before cleanup even when a file is active and close-all is requested", () => {
    const store = useRightPanelStore.getState();
    store.ensureMainTerminal(ref, binding.mainTerminalId);
    store.openFile(ref, "file.ts");
    store.openTerminal(ref, "term-8");
    const cleanup = vi.fn();
    closeWorkspaceSurfaces({
      surfaces: state().surfaces,
      binding,
      cleanup,
      close: (surface) => store.closeSurface(ref, surface.id),
    });
    expect(cleanup.mock.calls[0]?.[0].map((surface: { id: string }) => surface.id)).toEqual([
      "file:file.ts",
      "terminal:term-8",
    ]);
    expect(state().surfaces.map((surface) => surface.id)).toEqual(["terminal:term-7"]);
    expect(state().isOpen).toBe(true);
  });
  it("keeps identical thread ids in separate environments independent", () => {
    const store = useRightPanelStore.getState();
    store.ensureMainTerminal(ref, binding.mainTerminalId);
    store.ensureMainTerminal({ ...ref, environmentId: EnvironmentId.make("b") }, "term-2");
    expect(state().surfaces[0]?.id).toBe("terminal:term-7");
  });
  it("preserves legacy terminals when extracting a principal from a split", () => {
    const store = useRightPanelStore.getState();
    store.openTerminal(ref, "term-1");
    store.splitTerminal(ref, "terminal:term-1", "term-7");
    store.ensureMainTerminal(ref, "term-7");
    expect(state().surfaces.map((surface) => surface.id)).toEqual([
      "terminal:term-7",
      "terminal:term-1",
    ]);
  });
  it("keeps the auxiliary resource identity when the split root becomes principal", () => {
    const store = useRightPanelStore.getState();
    store.openTerminal(ref, "term-7");
    store.splitTerminal(ref, "terminal:term-7", "term-8");
    store.ensureMainTerminal(ref, "term-7");
    expect(state().surfaces[1]).toMatchObject({
      id: "terminal:term-8",
      resourceId: "term-8",
      terminalIds: ["term-8"],
      activeTerminalId: "term-8",
    });
  });
});
