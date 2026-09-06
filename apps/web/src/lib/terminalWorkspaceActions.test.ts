import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { focusMainTerminal, moveAuxiliaryTerminalsToDrawer } from "./terminalWorkspaceActions";
import {
  selectThreadRightPanelState,
  useRightPanelStore,
  selectRightPanelMaximized,
} from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
const ref = { environmentId: EnvironmentId.make("a"), threadId: ThreadId.make("t") };
const binding = { mainTerminalId: "term-7", startup: { _tag: "shell" as const } };
const state = () => selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref);
beforeEach(() => {
  useRightPanelStore.setState({
    byThreadKey: {},
    panelFirstByThreadKey: {},
    manuallyMaximizedByThreadKey: {},
  });
  useTerminalUiStateStore.getState().removeTerminalUiState(ref);
});
function migrate() {
  const panel = useRightPanelStore.getState();
  const drawer = useTerminalUiStateStore.getState();
  moveAuxiliaryTerminalsToDrawer({
    surfaces: state().surfaces,
    binding,
    move: (id) => drawer.ensureTerminal(ref, id, { active: false }),
    removeSurface: (surface) => panel.closeSurface(ref, surface.id),
  });
  panel.detachMainTerminal(ref, binding.mainTerminalId);
}
describe("independent main terminal", () => {
  it("focuses the main renderer without adding a surface or changing tools", () => {
    const panel = useRightPanelStore.getState();
    panel.openFile(ref, "file.ts");
    const before = state();
    const focus = vi.fn();
    focusMainTerminal({ ref, binding, focus });
    expect(focus).toHaveBeenCalledOnce();
    expect(state()).toBe(before);
  });
  it.each([true, false])(
    "migrates legacy splits without losing auxiliaries (main root: %s)",
    (mainRoot) => {
      const panel = useRightPanelStore.getState();
      const root = mainRoot ? "term-7" : "term-8";
      panel.openTerminal(ref, root);
      panel.splitTerminal(ref, `terminal:${root}`, mainRoot ? "term-8" : "term-7");
      panel.openFile(ref, "file.ts");
      panel.setPanelFirst(ref, true);
      migrate();
      migrate();
      expect(state().surfaces.map((surface) => surface.id)).toEqual(["file:file.ts"]);
      expect(state().activeSurfaceId).toBe("file:file.ts");
      expect(
        selectThreadTerminalUiState(
          useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
          ref,
        ).terminalIds,
      ).toEqual(["term-8"]);
      expect(useRightPanelStore.getState().panelFirstByThreadKey).toEqual({});
      panel.toggleMaximized(ref);
      migrate();
      const current = useRightPanelStore.getState();
      expect(
        selectRightPanelMaximized(
          current.panelFirstByThreadKey,
          current.manuallyMaximizedByThreadKey,
          ref,
        ),
      ).toBe(true);
    },
  );
  it("closes a panel containing only the main and isolates environments", () => {
    const panel = useRightPanelStore.getState();
    const other = { ...ref, environmentId: EnvironmentId.make("b") };
    panel.openTerminal(ref, "term-7");
    panel.openTerminal(other, "term-7");
    migrate();
    expect(state()).toEqual({ isOpen: false, activeSurfaceId: null, surfaces: [] });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, other).surfaces,
    ).toHaveLength(1);
  });
});
