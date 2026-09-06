import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  deriveAgentPanelModel,
  foldSubagentActivities,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { ProjectId, type ScopedThreadRef } from "@t3tools/contracts";
import { lazy, Suspense, useMemo, useState } from "react";
import { useThreadShell, useProject, useThreadDetail } from "../state/entities";
import { primaryServerKeybindingsAtom, serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { previewEnvironment } from "../state/preview";
import {
  useRightPanelStore,
  selectThreadRightPanelState,
  type RightPanelSurface,
} from "../rightPanelStore";
import {
  useThreadPreviewState,
  setActivePreviewTab,
  isPreviewSupportedInRuntime,
} from "../previewStateStore";
import { previewRuntimeTabId } from "../browser/previewRuntimeTabId";
import { RightPanelTabs } from "./RightPanelTabs";
import { Button } from "./ui/button";
import { RightPanelSheet } from "./RightPanelSheet";
import { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";
import { AgentsPanel } from "./AgentsPanel";
import { PullRequestDetailPanel } from "./pullRequest/PullRequestDetailPanel";
import { closePreviewSession } from "./preview/closePreviewSession";

const FilePreviewPanel = lazy(() => import("./files/FilePreviewPanel"));
const DiffPanel = lazy(() => import("./DiffPanel"));
const PreviewPanel = lazy(() =>
  import("./preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);

/** Tool state stays independent of the main terminal's renderer and lifecycle. */
export function ThreadWorkspaceTools({
  threadRef,
  maximized,
  sheet,
  onNewTerminal,
  onClose,
}: {
  threadRef: ScopedThreadRef;
  maximized: boolean;
  sheet: boolean;
  onNewTerminal: () => void;
  onClose: () => void;
}) {
  const shell = useThreadShell(threadRef);
  const project = useProject(
    shell ? scopeProjectRef(threadRef.environmentId, shell.projectId) : null,
  );
  const panel = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, threadRef),
  );
  const active = panel.surfaces.find((surface) => surface.id === panel.activeSurfaceId);
  const preview = useThreadPreviewState(threadRef);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const config = useAtomValue(serverEnvironment.configValueAtom(threadRef.environmentId));
  const closePreview = useAtomCommand(previewEnvironment.close, "preview close");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const store = useRightPanelStore.getState();
  const closeSurface = (surface: RightPanelSurface) => {
    if (surface.kind === "preview" && surface.resourceId)
      void closePreviewSession({
        closePreview,
        snapshot: preview.sessions[surface.resourceId] ?? null,
        tabId: surface.resourceId,
        threadRef,
      });
    store.closeSurface(threadRef, surface.id);
  };
  const content =
    active?.kind === "preview" ? (
      <PreviewPanel mode="embedded" threadRef={threadRef} tabId={active.resourceId} visible />
    ) : active?.kind === "diff" ? (
      <DiffPanel mode="embedded" composerDraftTarget={threadRef} initialGitScope="unstaged" />
    ) : active?.kind === "pull-request" ? (
      <PullRequestDetailPanel
        environmentId={threadRef.environmentId}
        reference={{
          projectId: ProjectId.make(active.projectId),
          repository: active.repository,
          number: active.number,
        }}
        context="thread"
      />
    ) : active?.kind === "agents" ? (
      <WorkspaceAgents threadRef={threadRef} />
    ) : (active?.kind === "files" || active?.kind === "file") && project ? (
      <FilePreviewPanel
        environmentId={threadRef.environmentId}
        cwd={shell?.worktreePath ?? project.workspaceRoot}
        projectName={project.title}
        threadRef={threadRef}
        composerDraftTarget={threadRef}
        keybindings={keybindings}
        availableEditors={config?.availableEditors ?? []}
        relativePath={active.kind === "file" ? active.relativePath : null}
        revealLine={active.kind === "file" ? active.revealLine : null}
        revealRequestId={active.kind === "file" ? active.revealRequestId : 0}
        onOpenFile={(path) => store.openFile(threadRef, path)}
        onPendingChange={(path, busy) =>
          setPending((current) => {
            const next = new Set(current);
            if (busy) next.add(`file:${path}`);
            else next.delete(`file:${path}`);
            return next;
          })
        }
      />
    ) : null;
  const tabs = (
    <RightPanelTabs
      mode={sheet ? "sheet" : "inline"}
      maximized={maximized}
      layoutControls={
        sheet ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close tools
          </Button>
        ) : undefined
      }
      surfaces={panel.surfaces}
      activeSurfaceId={active?.id ?? null}
      pendingSurfaceIds={pending}
      previewSessions={preview.sessions}
      desktopByTabId={preview.desktopByTabId}
      previewRuntimeTabId={(id) => previewRuntimeTabId(threadRef, preview.serverEpoch, id)}
      terminalLabelsById={new Map()}
      onActivate={(surface) => {
        store.activateSurface(threadRef, surface.id);
        if (surface.kind === "preview" && surface.resourceId)
          setActivePreviewTab(threadRef, surface.resourceId);
      }}
      onCloseSurface={closeSurface}
      onCloseOtherSurfaces={(surface) =>
        panel.surfaces.filter((candidate) => candidate.id !== surface.id).forEach(closeSurface)
      }
      onCloseSurfacesToRight={(surface) =>
        panel.surfaces.slice(panel.surfaces.indexOf(surface) + 1).forEach(closeSurface)
      }
      onCloseAllSurfaces={() => panel.surfaces.forEach(closeSurface)}
      onCopyFilePath={(path) => void navigator.clipboard.writeText(path)}
      onAddBrowser={() => store.openBrowser(threadRef, null)}
      onAddTerminal={onNewTerminal}
      onAddDiff={() => store.open(threadRef, "diff")}
      onAddFiles={() => store.open(threadRef, "files")}
      onAddPullRequest={() => {}}
      onAddAgents={() => store.open(threadRef, "agents")}
      browserAvailable={isPreviewSupportedInRuntime()}
      terminalAvailable={!!project}
      diffAvailable={!!project}
      filesAvailable={!!project}
      pullRequestAvailable={false}
      agentsAvailable
      liveAgentCount={0}
    >
      <DiffWorkerPoolProvider>
        <Suspense fallback={null}>{content}</Suspense>
      </DiffWorkerPoolProvider>
    </RightPanelTabs>
  );
  return sheet ? (
    <RightPanelSheet open onClose={onClose}>
      {tabs}
    </RightPanelSheet>
  ) : (
    tabs
  );
}

function WorkspaceAgents({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useThreadDetail(threadRef);
  const model = useMemo(
    () =>
      deriveAgentPanelModel({
        agents: foldSubagentActivities(thread?.activities ?? [], {
          sessionLive: !!thread?.session,
        }),
      }),
    [thread?.activities, thread?.session],
  );
  return (
    <AgentsPanel
      model={model}
      environmentId={threadRef.environmentId}
      threadId={threadRef.threadId}
    />
  );
}
