import type { ScopedThreadRef, TerminalWorkspaceBinding } from "@t3tools/contracts";
import type { RightPanelSurface } from "../rightPanelStore";

export function isMainTerminalSurface(
  surface: RightPanelSurface,
  binding: TerminalWorkspaceBinding | null | undefined,
): boolean {
  return (
    !!binding && surface.kind === "terminal" && surface.terminalIds.includes(binding.mainTerminalId)
  );
}

/** Presentation actions have no access to PTY open/restart/close operations. */
export function focusMainTerminal(input: {
  ref: ScopedThreadRef;
  binding: TerminalWorkspaceBinding;
  ensure: (ref: ScopedThreadRef, terminalId: string, activate: boolean) => void;
  focus: () => void;
}): void {
  input.ensure(input.ref, input.binding.mainTerminalId, true);
  input.focus();
}

export function closeWorkspaceSurfaces(input: {
  surfaces: readonly RightPanelSurface[];
  binding: TerminalWorkspaceBinding | null | undefined;
  cleanup: (surfaces: readonly RightPanelSurface[]) => void;
  close: (surface: RightPanelSurface) => void;
}): void {
  const closable = input.surfaces.filter(
    (surface) => !isMainTerminalSurface(surface, input.binding),
  );
  input.cleanup(closable);
  closable.forEach(input.close);
}

/** Move auxiliary tabs without closing or restarting their terminal processes. */
export function moveAuxiliaryTerminalsToDrawer(input: {
  surfaces: readonly RightPanelSurface[];
  binding: TerminalWorkspaceBinding;
  move: (terminalId: string) => void;
  removeSurface: (surface: RightPanelSurface) => void;
}): void {
  for (const surface of input.surfaces) {
    if (surface.kind !== "terminal" || isMainTerminalSurface(surface, input.binding)) continue;
    surface.terminalIds.forEach(input.move);
    input.removeSurface(surface);
  }
}
