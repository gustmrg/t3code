import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef, TerminalWorkspaceBinding } from "@t3tools/contracts";
import { projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { nextTerminalId, resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useThreadShell, useProject } from "../state/entities";
import { useKnownTerminalSessions } from "../state/terminalSessions";
import { useAtomCommand } from "../state/use-atom-command";
import { terminalEnvironment } from "../state/terminal";
import { primaryServerKeybindingsAtom, serverEnvironment } from "../state/server";
import {
  selectThreadRightPanelState,
  useRightPanelStore,
  selectRightPanelMaximized,
} from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { moveAuxiliaryTerminalsToDrawer } from "../lib/terminalWorkspaceActions";
import { confirmTerminalClose } from "../lib/terminalCloseConfirm";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { isElectron } from "../env";
import { TerminalViewport } from "./ThreadTerminalDrawer";
import { PersistentThreadTerminalDrawer } from "./PersistentThreadTerminals";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { PanelLayoutControls, RightPanelMaximizeControl } from "./chat/PanelLayoutControls";
import { Button } from "./ui/button";
import { ThreadWorkspaceTools } from "./ThreadWorkspaceTools";

const ignoreSelection = () => {};

export function ThreadTerminalWorkspace({
  threadRef,
  binding,
}: {
  threadRef: ScopedThreadRef;
  binding: TerminalWorkspaceBinding;
}) {
  const shell = useThreadShell(threadRef);
  const project = useProject(
    shell ? scopeProjectRef(threadRef.environmentId, shell.projectId) : null,
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const config = useAtomValue(serverEnvironment.configValueAtom(threadRef.environmentId));
  const sessions = useKnownTerminalSessions({
    environmentId: threadRef.environmentId,
    threadId: threadRef.threadId,
  });
  const drawer = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef),
  );
  const panel = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, threadRef),
  );
  const maximized = useRightPanelStore((state) =>
    selectRightPanelMaximized(
      state.panelFirstByThreadKey,
      state.manuallyMaximizedByThreadKey,
      threadRef,
    ),
  );
  const sheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [mainFocus, setMainFocus] = useState(1);
  const [drawerFocus, setDrawerFocus] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const open = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const close = useAtomCommand(terminalEnvironment.close, "close session");
  const navigate = useNavigate();
  const cwd = shell?.worktreePath ?? project?.workspaceRoot;
  const worktreePath = shell?.worktreePath ?? null;
  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({ project: { cwd: project.workspaceRoot }, worktreePath })
        : {},
    [project, worktreePath],
  );

  useEffect(() => {
    const panels = useRightPanelStore.getState();
    const terminals = useTerminalUiStateStore.getState();
    const wasOpen = selectThreadTerminalUiState(
      terminals.terminalUiStateByThreadKey,
      threadRef,
    ).terminalOpen;
    moveAuxiliaryTerminalsToDrawer({
      surfaces: selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces,
      binding,
      move: (id) => terminals.ensureTerminal(threadRef, id, { active: false }),
      removeSurface: (surface) => panels.closeSurface(threadRef, surface.id),
    });
    terminals.closeTerminal(threadRef, binding.mainTerminalId);
    terminals.setTerminalOpen(
      threadRef,
      wasOpen &&
        selectThreadTerminalUiState(
          useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
          threadRef,
        ).terminalIds.length > 0,
    );
    panels.detachMainTerminal(threadRef, binding.mainTerminalId);
  }, [binding.mainTerminalId, threadRef]);

  const resume = useCallback(async () => {
    if (!cwd) return;
    setError(null);
    const result = await open({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        terminalId: binding.mainTerminalId,
        cwd,
        ...(binding.startup._tag === "agent" ? { resumeSession: true } : {}),
        ...(worktreePath ? { worktreePath } : {}),
        env: runtimeEnv,
      },
    });
    if (result._tag === "Failure")
      setError("The session could not be opened. Try again after reconnecting.");
    else setMainFocus((value) => value + 1);
  }, [binding, cwd, open, runtimeEnv, threadRef, worktreePath]);
  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (
      resumeAttempted.current ||
      !cwd ||
      binding.startup._tag !== "agent" ||
      !config?.environment.capabilities.terminalSessionResume
    )
      return;
    resumeAttempted.current = true;
    void resume();
  }, [binding.startup._tag, config?.environment.capabilities.terminalSessionResume, cwd, resume]);

  const endSession = useCallback(async () => {
    if (!(await confirmTerminalClose(["Main terminal — close this thread's running session"])))
      return;
    const result = await close({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, terminalId: binding.mainTerminalId },
    });
    if (result._tag !== "Failure") await navigate({ to: "/", search: { sessionClosed: true } });
  }, [binding.mainTerminalId, close, navigate, threadRef]);

  const newAuxiliary = useCallback(() => {
    if (!cwd) return;
    const id = nextTerminalId([
      binding.mainTerminalId,
      ...drawer.terminalIds,
      ...sessions.map((session) => session.target.terminalId),
    ]);
    useTerminalUiStateStore.getState().newTerminal(threadRef, id);
    setDrawerFocus((value) => value + 1);
    void open({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        terminalId: id,
        cwd,
        ...(worktreePath ? { worktreePath } : {}),
        env: runtimeEnv,
      },
    });
  }, [
    binding.mainTerminalId,
    cwd,
    drawer.terminalIds,
    open,
    runtimeEnv,
    sessions,
    threadRef,
    worktreePath,
  ]);
  const toggleDrawer = () => {
    if (
      !drawer.terminalOpen &&
      drawer.terminalIds.filter((id) => id !== binding.mainTerminalId).length === 0
    ) {
      newAuxiliary();
      return;
    }
    useTerminalUiStateStore.getState().setTerminalOpen(threadRef, !drawer.terminalOpen);
    if (drawer.terminalOpen) setMainFocus((value) => value + 1);
    else setDrawerFocus((value) => value + 1);
  };
  const togglePanel = () => {
    useRightPanelStore.getState().toggleVisibility(threadRef);
    if (panel.isOpen) setMainFocus((value) => value + 1);
  };
  const summary = sessions.find((session) => session.target.terminalId === binding.mainTerminalId)
    ?.state.summary;
  const mainHidden = panel.isOpen && maximized && !sheet;
  const label = summary
    ? resolveTerminalSessionLabel(binding.mainTerminalId, summary)
    : "Main terminal";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="absolute right-[var(--workspace-controls-right)] top-0 z-50 flex h-[var(--workspace-topbar-height)] items-center no-drag">
        {panel.isOpen && !sheet ? (
          <RightPanelMaximizeControl
            maximized={maximized}
            onToggle={() => useRightPanelStore.getState().toggleMaximized(threadRef)}
          />
        ) : null}
        <PanelLayoutControls
          terminalAvailable={!!project}
          terminalOpen={drawer.terminalOpen}
          terminalShortcutLabel={null}
          rightPanelAvailable={!!project}
          rightPanelOpen={panel.isOpen}
          rightPanelShortcutLabel={null}
          liveAgentCount={0}
          onToggleTerminal={toggleDrawer}
          onToggleRightPanel={togglePanel}
        />
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div
          className={mainHidden ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}
          data-terminal-owner="main"
        >
          <WorkspacePageHeader electron={isElectron} className="border-b border-border pr-36">
            <span className="truncate text-sm">
              {shell?.title ?? "Terminal"} · {label}
            </span>
            <Button variant="ghost" size="sm" className="no-drag" onClick={() => void endSession()}>
              End session
            </Button>
          </WorkspacePageHeader>
          {error ? (
            <div role="alert" className="flex items-center gap-3 p-3 text-sm">
              {error}
              <Button onClick={() => void resume()}>Retry</Button>
            </div>
          ) : null}
          {cwd ? (
            <div className="min-h-0 flex-1">
              <TerminalViewport
                existingOnly
                advancedTypography={false}
                threadRef={threadRef}
                threadId={threadRef.threadId}
                terminalId={binding.mainTerminalId}
                terminalLabel={label}
                cwd={cwd}
                worktreePath={worktreePath}
                runtimeEnv={runtimeEnv}
                onSessionExited={() => {}}
                onAddTerminalContext={ignoreSelection}
                focusRequestId={mainFocus}
                autoFocus={!mainHidden}
                resizeEpoch={mainHidden ? 0 : 1}
                keybindings={keybindings}
              />
            </div>
          ) : null}
          {summary?.status === "exited" ? (
            <Button onClick={() => void resume()}>Resume session</Button>
          ) : null}
        </div>
        {panel.isOpen ? (
          <ThreadWorkspaceTools
            threadRef={threadRef}
            maximized={maximized}
            sheet={sheet}
            onNewTerminal={newAuxiliary}
            onClose={() => {
              useRightPanelStore.getState().close(threadRef);
              setMainFocus((value) => value + 1);
            }}
          />
        ) : null}
      </div>
      <PersistentThreadTerminalDrawer
        threadRef={threadRef}
        threadId={threadRef.threadId}
        visible={drawer.terminalOpen}
        launchContext={cwd ? { cwd, worktreePath } : null}
        focusRequestId={drawerFocus}
        splitShortcutLabel={undefined}
        splitVerticalShortcutLabel={undefined}
        newShortcutLabel={undefined}
        closeShortcutLabel={undefined}
        keybindings={keybindings}
        onAddTerminalContext={ignoreSelection}
      />
    </div>
  );
}
