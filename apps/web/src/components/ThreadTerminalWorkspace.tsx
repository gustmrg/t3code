import * as Schema from "effect/Schema";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "../appearanceFonts";
import { getTerminalFocusOwner } from "../lib/terminalFocus";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import { subscribeWorkspaceAction } from "../workspaceActionBus";
import { subscribePreviewAction } from "./preview/previewActionBus";
import { isCommandPaletteOpen } from "../commandPaletteBus";
import { isTerminalCloseConfirmPending } from "../lib/terminalCloseConfirm";
import {
  preventTerminalCloseShortcut,
  preventRepeatedTerminalCloseShortcut,
} from "../lib/terminalCloseShortcut";
import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef, TerminalWorkspaceBinding } from "@t3tools/contracts";
import { projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { nextTerminalId, resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
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
    terminals.configureMainTerminal(threadRef, binding.mainTerminalId);
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

  const newAuxiliary = useCallback(
    (mode: "new" | "split" | "vertical" = "new") => {
      if (!cwd) return;
      const terminalStore = useTerminalUiStateStore.getState();
      const current = selectThreadTerminalUiState(
        terminalStore.terminalUiStateByThreadKey,
        threadRef,
      );
      const id = nextTerminalId([
        binding.mainTerminalId,
        ...current.terminalIds,
        ...sessions.map((session) => session.target.terminalId),
      ]);
      if (mode === "split") terminalStore.splitTerminal(threadRef, id);
      else if (mode === "vertical") terminalStore.splitTerminalVertical(threadRef, id);
      else terminalStore.newTerminal(threadRef, id);
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
    },
    [binding.mainTerminalId, cwd, open, runtimeEnv, sessions, threadRef, worktreePath],
  );
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
  const closeAuxiliary = async () => {
    const id = drawer.activeTerminalId;
    if (!id || id === binding.mainTerminalId) return;
    const label = drawer.auxiliaryOrdinals?.[id] ? `Terminal ${drawer.auxiliaryOrdinals[id]}` : id;
    if (!(await confirmTerminalClose([label]))) return;
    const result = await close({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, terminalId: id, deleteHistory: true },
    });
    if (result._tag !== "Failure") {
      useTerminalUiStateStore.getState().closeTerminal(threadRef, id);
      setDrawerFocus((value) => value + 1);
    }
  };
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      preventRepeatedTerminalCloseShortcut(event, keybindings) ||
      (isTerminalCloseConfirmPending() && preventTerminalCloseShortcut(event, keybindings))
    ) {
      event.stopPropagation();
      return;
    }
    if (isCommandPaletteOpen()) return;
    const owner = getTerminalFocusOwner();
    if (event.defaultPrevented && !owner) return;
    const command = resolveShortcutCommand(event, keybindings, {
      context: {
        terminalFocus: owner !== null,
        terminalOpen: drawer.terminalOpen,
        modelPickerOpen: false,
      },
    });
    switch (command) {
      case "terminal.toggle":
        toggleDrawer();
        break;
      case "terminal.new":
        newAuxiliary();
        break;
      case "terminal.split":
        newAuxiliary(owner === "drawer" ? "split" : "new");
        break;
      case "terminal.splitVertical":
        newAuxiliary(owner === "drawer" ? "vertical" : "new");
        break;
      case "terminal.close":
        if (owner === "main") void endSession();
        else if (owner === "drawer") void closeAuxiliary();
        else return;
        break;
      case "rightPanel.toggle":
        togglePanel();
        break;
      case "rightPanel.toggleMaximized":
        if (panel.isOpen && !sheet) useRightPanelStore.getState().toggleMaximized(threadRef);
        break;
      case "diff.toggle":
        useRightPanelStore.getState().toggle(threadRef, "diff");
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const onWorkspaceAction = useEffectEvent(
    (action: Parameters<Parameters<typeof subscribeWorkspaceAction>[0]>[0]) => {
      const panels = useRightPanelStore.getState();
      switch (action) {
        case "open-terminal":
          if (!drawer.terminalOpen) toggleDrawer();
          else setDrawerFocus((value) => value + 1);
          break;
        case "open-files":
          panels.open(threadRef, "files");
          break;
        case "open-diff":
          panels.open(threadRef, "diff");
          break;
        case "open-preview":
          panels.openBrowser(threadRef, null);
          break;
        case "use-panel-workspace":
          if (panel.isOpen && !maximized) panels.toggleMaximized(threadRef);
          break;
        case "restore-chat":
          panels.restoreSplit(threadRef);
          setMainFocus((value) => value + 1);
          break;
      }
    },
  );
  useEffect(() => subscribeWorkspaceAction((action) => onWorkspaceAction(action)), []);
  const onPreviewAction = useEffectEvent(() =>
    useRightPanelStore.getState().toggle(threadRef, "preview"),
  );
  useEffect(() => subscribePreviewAction(() => onPreviewAction()), []);
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
          terminalShortcutLabel={shortcutLabelForCommand(keybindings, "terminal.toggle")}
          rightPanelAvailable={!!project}
          rightPanelOpen={panel.isOpen}
          rightPanelShortcutLabel={shortcutLabelForCommand(keybindings, "rightPanel.toggle")}
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
                allowChatContext={false}
                advancedTypography={advancedTypography}
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
          {!summary || summary.status === "exited" || summary.status === "error" ? (
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
        splitShortcutLabel={shortcutLabelForCommand(keybindings, "terminal.split") ?? undefined}
        splitVerticalShortcutLabel={
          shortcutLabelForCommand(keybindings, "terminal.splitVertical") ?? undefined
        }
        newShortcutLabel={shortcutLabelForCommand(keybindings, "terminal.new") ?? undefined}
        closeShortcutLabel={shortcutLabelForCommand(keybindings, "terminal.close") ?? undefined}
        keybindings={keybindings}
        onAddTerminalContext={ignoreSelection}
      />
    </div>
  );
}
