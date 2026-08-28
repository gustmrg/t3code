import { useAtomValue } from "@effect/atom-react";
import {
  scopedProjectKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { resolveThreadLaunchPreference } from "@t3tools/client-runtime/thread-launch-preference";
import { wasBootstrapThreadDeleted } from "@t3tools/client-runtime/errors";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type ScopedProjectRef,
  type ThreadId,
} from "@t3tools/contracts";
import { projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import {
  composerDraftHasUserContent,
  markPromotedDraftThreadByRef,
  type DraftId,
  type DraftThreadEnvMode,
  type DraftThreadState,
  useComposerDraftStore,
} from "../composerDraftStore";
import { newDraftId, newThreadId, randomHex } from "../lib/utils";
import { orderItemsByPreferredIds } from "../components/Sidebar.logic";
import {
  deriveLogicalProjectKeyFromSettings,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { resolveDefaultThreadEnvMode } from "@t3tools/shared/threadEnvMode";
import {
  readThreadShell,
  useProjects,
  useThread,
  waitForProject,
  waitForThreadShell,
} from "../state/entities";
import { resolveNewDraftStartFromOrigin } from "../lib/chatThreadActions";
import { readT3ProjectFileDefaultThreadEnvMode } from "../lib/t3ProjectFileDefaults";
import { primaryServerSettingsAtom } from "../state/server";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../uiStateStore";
import { useClientSettings } from "./useSettings";
import { useAtomCommand } from "../state/use-atom-command";
import { threadEnvironment } from "../state/threads";
import { terminalEnvironment } from "../state/terminal";
import { useEnvironments } from "../state/environments";
import {
  deriveProviderInstanceEntries,
  NO_PROVIDER_MODEL_SELECTION,
  resolveDefaultProviderModelSelection,
} from "../providerInstances";
import { useRightPanelStore } from "../rightPanelStore";
import { DEFAULT_THREAD_TERMINAL_ID } from "../types";
import {
  buildTerminalMaterializeInput,
  coordinateTerminalFirstLaunch,
} from "../lib/newThreadLaunch";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { appAtomRegistry } from "../rpc/atomRegistry";

interface NewThreadWorkspaceOptions {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
  startFromOrigin?: boolean;
}

interface NewThreadOptions extends NewThreadWorkspaceOptions {
  replace?: boolean;
  carryComposerContent?: boolean;
  /** Internal continuation flows can request a fresh structured composer explicitly. */
  forceChat?: boolean;
}

// The workspace options the caller passed explicitly, shaped for the draft
// store: absent keys stay absent so they never overwrite existing draft
// state. Every reuse path applies exactly this set.
function pickExplicitWorkspaceOptions(options: NewThreadWorkspaceOptions | undefined) {
  return {
    ...(options?.branch !== undefined ? { branch: options.branch } : {}),
    ...(options?.worktreePath !== undefined ? { worktreePath: options.worktreePath } : {}),
    ...(options?.envMode !== undefined ? { envMode: options.envMode } : {}),
    ...(options?.startFromOrigin !== undefined ? { startFromOrigin: options.startFromOrigin } : {}),
  };
}

function useDraftNewThreadHandler() {
  const projects = useProjects();
  // New-thread defaults are a user preference, and the settings UI only ever
  // edits the primary environment's settings.json. Reading the target
  // environment's own settings here would silently reset remote projects to
  // the decoded defaults ("local" mode, current branch), since nothing can
  // set those values on a remote server.
  const primaryServerSettings = useAtomValue(primaryServerSettingsAtom);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const router = useRouter();
  const getCurrentRouteTarget = useCallback(() => {
    const currentRouteParams = router.state.matches[router.state.matches.length - 1]?.params ?? {};
    return resolveThreadRouteTarget(currentRouteParams);
  }, [router]);

  return useCallback(
    (
      projectRef: ScopedProjectRef,
      options?: NewThreadOptions,
      // Which draft the thread ended up in, so a caller that has something to put in it — a
      // prepared checkout, a task to write — addresses that one rather than looking the project
      // up again and finding whichever draft it happens to hold.
    ): Promise<{ draftId: DraftId; threadId: ThreadId } | null> => {
      const {
        getComposerDraft,
        getDraftSessionByLogicalProjectKey,
        getDraftSession,
        getDraftThread,
        applyStickyState,
        moveComposerPromptAndImages,
        setDraftThreadContext,
        setLogicalProjectDraftThreadId,
        setModelSelection,
      } = useComposerDraftStore.getState();
      const currentRouteTarget = getCurrentRouteTarget();
      // A new thread carries the user's *working mode* from the thread being
      // viewed: model (including options like reasoning effort and context
      // window), permission mode, and interaction mode. Branch, worktree, and
      // env mode never carry implicitly — those come from the configured
      // defaults unless the caller passes them explicitly.
      const carrySourceShell =
        currentRouteTarget?.kind === "server"
          ? readThreadShell(currentRouteTarget.threadRef)
          : null;
      const carrySourceDraft =
        currentRouteTarget?.kind === "draft" ? getDraftSession(currentRouteTarget.draftId) : null;
      // Composer overrides win over the persisted thread state — they are
      // what the user currently sees in the composer controls.
      const carrySourceComposer = currentRouteTarget
        ? getComposerDraft(
            currentRouteTarget.kind === "server"
              ? currentRouteTarget.threadRef
              : currentRouteTarget.draftId,
          )
        : null;
      const composerActiveProvider = carrySourceComposer?.activeProvider ?? null;
      const composerModelSelection = composerActiveProvider
        ? (carrySourceComposer?.modelSelectionByProvider[composerActiveProvider] ?? null)
        : null;
      const carryModelSelection =
        composerModelSelection ?? carrySourceShell?.modelSelection ?? null;
      const carryRuntimeMode =
        carrySourceComposer?.runtimeMode ??
        carrySourceShell?.runtimeMode ??
        carrySourceDraft?.runtimeMode ??
        null;
      const carryInteractionMode =
        carrySourceComposer?.interactionMode ??
        carrySourceShell?.interactionMode ??
        carrySourceDraft?.interactionMode ??
        null;
      // Content only moves when the caller opted in and the user is looking
      // at a draft. The content check happens at move time, not here: the
      // paths below await, and text typed during those awaits must still
      // come along.
      const carryContentSourceDraftId =
        options?.carryComposerContent === true && currentRouteTarget?.kind === "draft"
          ? currentRouteTarget.draftId
          : null;
      const carryComposerContentTo = (destinationDraftId: DraftId) => {
        if (
          carryContentSourceDraftId &&
          carryContentSourceDraftId !== destinationDraftId &&
          // Never clobber a destination the user already invested in — the
          // move overwrites the destination prompt, so a concurrent repo
          // change that carried content first must win.
          !composerDraftHasUserContent(getComposerDraft(destinationDraftId)) &&
          composerDraftHasUserContent(getComposerDraft(carryContentSourceDraftId))
        ) {
          moveComposerPromptAndImages(carryContentSourceDraftId, destinationDraftId);
        }
      };
      const project = projects.find(
        (candidate) =>
          candidate.id === projectRef.projectId &&
          candidate.environmentId === projectRef.environmentId,
      );
      // The shared resolver owns the priority order. The t3.json read is
      // skipped entirely when a higher-priority source decides, and its
      // query atom caches per project after the first call.
      const resolveDefaultEnvMode = async (): Promise<DraftThreadEnvMode> => {
        const consultProjectFile = project !== undefined && project.defaultThreadEnvMode == null;
        return resolveDefaultThreadEnvMode({
          projectSetting: project?.defaultThreadEnvMode,
          projectFile: consultProjectFile
            ? await readT3ProjectFileDefaultThreadEnvMode(
                project.environmentId,
                project.workspaceRoot,
              )
            : null,
          globalDefault: primaryServerSettings.defaultThreadEnvMode,
        });
      };
      const logicalProjectKey = project
        ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings)
        : scopedProjectKey(projectRef);
      const hasBranchOption = options?.branch !== undefined;
      const hasWorktreePathOption = options?.worktreePath !== undefined;
      const hasEnvModeOption = options?.envMode !== undefined;
      const hasStartFromOriginOption = options?.startFromOrigin !== undefined;
      const storedDraftThread = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      const storedDraftThreadRef = storedDraftThread
        ? scopeThreadRef(storedDraftThread.environmentId, storedDraftThread.threadId)
        : null;
      const reusableStoredDraftThread =
        storedDraftThread !== null &&
        storedDraftThread.promotedTo == null &&
        storedDraftThreadRef !== null &&
        readThreadShell(storedDraftThreadRef) === null
          ? storedDraftThread
          : null;
      if (storedDraftThreadRef && reusableStoredDraftThread === null) {
        markPromotedDraftThreadByRef(storedDraftThreadRef);
      }
      // New-thread surfaces (button, hotkeys, "/" landing, palette) only
      // ever reuse a draft the user has NOT invested in. A draft with typed
      // text or attachments is work in progress: it stays alive where it is
      // (reachable from the sidebar draft rows) and this request mints a
      // fresh draft instead — the remap in the store preserves invested
      // drafts rather than deleting them.
      const emptyStoredDraftThread =
        reusableStoredDraftThread &&
        !composerDraftHasUserContent(getComposerDraft(reusableStoredDraftThread.draftId))
          ? reusableStoredDraftThread
          : null;
      const latestActiveDraftThread: DraftThreadState | null = currentRouteTarget
        ? currentRouteTarget.kind === "server"
          ? getDraftThread(currentRouteTarget.threadRef)
          : getDraftSession(currentRouteTarget.draftId)
        : null;
      if (emptyStoredDraftThread) {
        return (async () => {
          const isDraftAlreadyOpen =
            currentRouteTarget?.kind === "draft" &&
            currentRouteTarget.draftId === emptyStoredDraftThread.draftId;
          const hasExplicitWorkspaceOption =
            hasBranchOption ||
            hasWorktreePathOption ||
            hasEnvModeOption ||
            hasStartFromOriginOption;
          // Resurrecting an empty stored draft must not resurrect its stale
          // context: explicit workspace options win outright; otherwise the
          // env context resets to the configured defaults so drafts seeded
          // before a defaults change (or by the old carry-over behavior) stop
          // landing on "current checkout" branches forever. When the draft is
          // already open and no options were passed, leave it alone entirely —
          // the user may have just picked a branch in the composer.
          let workspaceContext: NewThreadWorkspaceOptions | null = null;
          if (hasExplicitWorkspaceOption) {
            workspaceContext = pickExplicitWorkspaceOptions(options);
          } else if (!isDraftAlreadyOpen) {
            const defaultEnvMode = await resolveDefaultEnvMode();
            // The await yields. If the draft was opened (a concurrent
            // invocation's navigation landed), promoted to a real thread,
            // remapped away (a concurrent invocation registered a fresh
            // draft — remapping back would evict the winner and let the
            // store GC it), or gained content (no longer a reusable empty
            // draft) in the meantime, this invocation is a stale loser:
            // resetting context, remapping, or navigating would all clobber
            // state written after the snapshot above. Bail out entirely —
            // the winner already did this work.
            const routeTargetNow = getCurrentRouteTarget();
            const openedMeanwhile =
              routeTargetNow?.kind === "draft" &&
              routeTargetNow.draftId === emptyStoredDraftThread.draftId;
            const promotedMeanwhile =
              storedDraftThreadRef !== null && readThreadShell(storedDraftThreadRef) !== null;
            const remappedMeanwhile =
              getDraftSessionByLogicalProjectKey(logicalProjectKey)?.draftId !==
              emptyStoredDraftThread.draftId;
            const investedMeanwhile = composerDraftHasUserContent(
              getComposerDraft(emptyStoredDraftThread.draftId),
            );
            if (openedMeanwhile || promotedMeanwhile || remappedMeanwhile || investedMeanwhile) {
              return null;
            }
            workspaceContext = {
              branch: null,
              worktreePath: null,
              envMode: defaultEnvMode,
              startFromOrigin: resolveNewDraftStartFromOrigin({
                envMode: defaultEnvMode,
                newWorktreesStartFromOrigin: primaryServerSettings.newWorktreesStartFromOrigin,
              }),
            };
          }
          if (workspaceContext) {
            setDraftThreadContext(emptyStoredDraftThread.draftId, {
              ...workspaceContext,
              ...(carryRuntimeMode ? { runtimeMode: carryRuntimeMode } : {}),
              ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
            });
            if (carryModelSelection) {
              // The carried selection is a complete snapshot of the viewed
              // thread's model state: absent options mean "no options", not
              // "keep the stale draft's options".
              setModelSelection(emptyStoredDraftThread.draftId, carryModelSelection, {
                replaceOptions: true,
              });
            }
          }
          // The workspace context must also ride along here: when projectRef
          // targets a different physical member of the logical project,
          // createDraftThreadState treats the remap as a project change and
          // would otherwise wipe branch/worktree, undoing the write above.
          setLogicalProjectDraftThreadId(
            logicalProjectKey,
            projectRef,
            emptyStoredDraftThread.draftId,
            {
              threadId: emptyStoredDraftThread.threadId,
              ...workspaceContext,
              ...(carryRuntimeMode ? { runtimeMode: carryRuntimeMode } : {}),
              ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
            },
          );
          carryComposerContentTo(emptyStoredDraftThread.draftId);
          const opened = {
            draftId: emptyStoredDraftThread.draftId,
            threadId: emptyStoredDraftThread.threadId,
          };
          // Re-read the route: the snapshot from before the await is stale
          // once a concurrent invocation's navigation lands, and navigating
          // again would push a duplicate history entry.
          const routeTargetAfterWrites = getCurrentRouteTarget();
          if (
            routeTargetAfterWrites?.kind === "draft" &&
            routeTargetAfterWrites.draftId === emptyStoredDraftThread.draftId
          ) {
            return opened;
          }
          await router.navigate({
            to: "/draft/$draftId",
            params: { draftId: emptyStoredDraftThread.draftId },
            replace: options?.replace ?? false,
          });
          return opened;
        })();
      }

      if (
        latestActiveDraftThread &&
        currentRouteTarget?.kind === "draft" &&
        latestActiveDraftThread.logicalProjectKey === logicalProjectKey &&
        latestActiveDraftThread.promotedTo == null &&
        // Same content rule as above: a new-thread request while viewing an
        // invested draft mints a fresh one instead of repurposing it.
        !composerDraftHasUserContent(getComposerDraft(currentRouteTarget.draftId))
      ) {
        if (
          hasBranchOption ||
          hasWorktreePathOption ||
          hasEnvModeOption ||
          hasStartFromOriginOption
        ) {
          setDraftThreadContext(currentRouteTarget.draftId, pickExplicitWorkspaceOptions(options));
        }
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, currentRouteTarget.draftId, {
          threadId: latestActiveDraftThread.threadId,
          createdAt: latestActiveDraftThread.createdAt,
          runtimeMode: latestActiveDraftThread.runtimeMode,
          interactionMode: latestActiveDraftThread.interactionMode,
          ...pickExplicitWorkspaceOptions(options),
        });
        return Promise.resolve({
          draftId: currentRouteTarget.draftId,
          threadId: latestActiveDraftThread.threadId,
        });
      }

      const draftId = newDraftId();
      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      return (async () => {
        const initialEnvMode = options?.envMode ?? (await resolveDefaultEnvMode());
        // The await yields, so a concurrent invocation may have registered a
        // draft for this logical project in the meantime. Registering ours
        // too would evict that draft while its navigation is in flight —
        // reuse the winner instead, like the synchronous path above does.
        const racedDraft = getDraftSessionByLogicalProjectKey(logicalProjectKey);
        if (
          racedDraft &&
          // Only a draft REGISTERED during the await counts as a raced
          // winner. An invested draft this invocation deliberately declined
          // to reuse is still mapped at this point — reusing it here would
          // silently undo mint-fresh semantics.
          racedDraft.draftId !== storedDraftThread?.draftId &&
          readThreadShell(scopeThreadRef(racedDraft.environmentId, racedDraft.threadId)) === null
        ) {
          // Same remap the reuse paths above perform: point the draft at the
          // caller's project member and apply explicit workspace options if
          // the caller passed any. Without explicit options the winner's
          // context stands untouched — the winner's navigation is landing,
          // which is the isDraftAlreadyOpen "leave it alone" case. Writing
          // this invocation's defaults here instead would clobber the
          // winner's explicit picks and could pair its worktreePath with a
          // contradictory envMode.
          setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, racedDraft.draftId, {
            threadId: racedDraft.threadId,
            createdAt: racedDraft.createdAt,
            runtimeMode: racedDraft.runtimeMode,
            interactionMode: racedDraft.interactionMode,
            ...pickExplicitWorkspaceOptions(options),
          });
          carryComposerContentTo(racedDraft.draftId);
          await router.navigate({
            to: "/draft/$draftId",
            params: { draftId: racedDraft.draftId },
            replace: options?.replace ?? false,
          });
          return { draftId: racedDraft.draftId, threadId: racedDraft.threadId };
        }
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, draftId, {
          threadId,
          createdAt,
          branch: options?.branch ?? null,
          worktreePath: options?.worktreePath ?? null,
          envMode: initialEnvMode,
          startFromOrigin:
            options?.startFromOrigin ??
            resolveNewDraftStartFromOrigin({
              envMode: initialEnvMode,
              newWorktreesStartFromOrigin: primaryServerSettings.newWorktreesStartFromOrigin,
            }),
          runtimeMode: carryRuntimeMode ?? DEFAULT_RUNTIME_MODE,
          ...(carryInteractionMode ? { interactionMode: carryInteractionMode } : {}),
        });
        applyStickyState(draftId);
        if (carryModelSelection) {
          // After sticky state so the viewed thread's exact selection
          // (model + options like effort and context window) wins over the
          // globally sticky one. replaceOptions: the carried selection is a
          // complete snapshot — absent options mean "no options", not "keep
          // whatever sticky state just wrote".
          setModelSelection(draftId, carryModelSelection, { replaceOptions: true });
        }
        carryComposerContentTo(draftId);

        await router.navigate({
          to: "/draft/$draftId",
          params: { draftId },
          replace: options?.replace ?? false,
        });
        return { draftId, threadId };
      })();
    },
    [getCurrentRouteTarget, primaryServerSettings, projectGroupingSettings, projects, router],
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

/** Shared new-thread coordinator used by every web entry point. */
export function useNewThreadHandler() {
  const openDraft = useDraftNewThreadHandler();
  const { environments } = useEnvironments();
  const materializeThread = useAtomCommand(threadEnvironment.materialize, {
    reportFailure: false,
  });
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const router = useRouter();

  return useCallback(
    async (projectRef: ScopedProjectRef, options?: NewThreadOptions) => {
      const openedDraft = await openDraft(projectRef, options);
      if (!openedDraft) return null;
      if (options?.forceChat) return openedDraft;

      const project = await waitForProject(projectRef);
      const primaryServerSettings = appAtomRegistry.get(primaryServerSettingsAtom);

      const providers =
        environments.find((environment) => environment.environmentId === projectRef.environmentId)
          ?.serverConfig?.providers ?? [];
      const launchPreference = resolveThreadLaunchPreference({
        application: {
          defaultThreadView: primaryServerSettings.defaultThreadView,
          terminalStartup: primaryServerSettings.terminalStartup,
        },
        projectOverride: project.threadLaunchPreference ?? null,
        terminalWorkspaceSupported: true,
        availableProviderInstanceIds: deriveProviderInstanceEntries(providers).map(
          (entry) => entry.instanceId,
        ),
      });
      if (launchPreference.view === "chat") return openedDraft;

      const draftStore = useComposerDraftStore.getState();
      const draft = draftStore.getDraftSession(openedDraft.draftId);
      if (!draft || draft.threadId !== openedDraft.threadId) return openedDraft;

      const composer = draftStore.getComposerDraft(openedDraft.draftId);
      const composerSelection = composer?.activeProvider
        ? composer.modelSelectionByProvider[composer.activeProvider]
        : null;
      const modelSelection: ModelSelection =
        composerSelection ??
        project.defaultModelSelection ??
        resolveDefaultProviderModelSelection(providers, null) ??
        NO_PROVIDER_MODEL_SELECTION;
      const threadRef = scopeThreadRef(draft.environmentId, draft.threadId);
      const materializeInput = buildTerminalMaterializeInput({
        threadId: draft.threadId,
        projectId: project.id,
        modelSelection,
        runtimeMode: draft.runtimeMode,
        interactionMode: draft.interactionMode,
        envMode: draft.envMode,
        projectCwd: project.workspaceRoot,
        branch: draft.branch,
        worktreePath: draft.worktreePath,
        startFromOrigin: draft.startFromOrigin,
        randomHex,
      });

      const result = await coordinateTerminalFirstLaunch({
        threadRef,
        materializeInput,
        operations: {
          materialize: async (input) => {
            const commandResult = await materializeThread({
              environmentId: threadRef.environmentId,
              input,
            });
            return commandResult._tag === "Failure"
              ? { _tag: "Failure", error: squashAtomCommandFailure(commandResult) }
              : { _tag: "Success", value: commandResult.value };
          },
          waitForThreadShell,
          navigateToThread: async (materializedThreadRef) => {
            markPromotedDraftThreadByRef(materializedThreadRef);
            await router.navigate({
              to: "/$environmentId/$threadId",
              params: {
                environmentId: materializedThreadRef.environmentId,
                threadId: materializedThreadRef.threadId,
              },
              replace: true,
            });
          },
          terminalInput: (thread) => {
            const worktreePath = thread.worktreePath ?? null;
            return {
              threadId: thread.id,
              terminalId: DEFAULT_THREAD_TERMINAL_ID,
              cwd: worktreePath ?? project.workspaceRoot,
              ...(worktreePath ? { worktreePath } : {}),
              env: projectScriptRuntimeEnv({
                project: { cwd: project.workspaceRoot },
                worktreePath,
              }),
            };
          },
          openTerminal: async (input) => {
            const terminalResult = await openTerminal({
              environmentId: threadRef.environmentId,
              input,
            });
            return terminalResult._tag === "Failure"
              ? { _tag: "Failure", error: squashAtomCommandFailure(terminalResult) }
              : { _tag: "Success", value: terminalResult.value };
          },
          activateTerminalWorkspace: () => {
            const panel = useRightPanelStore.getState();
            panel.openTerminal(threadRef, DEFAULT_THREAD_TERMINAL_ID);
            panel.setPanelFirst(threadRef, true);
          },
          restoreChatWorkspace: () => {
            useRightPanelStore.getState().restoreSplit(threadRef);
          },
        },
      });

      if (result._tag === "MaterializeFailure") {
        if (wasBootstrapThreadDeleted(result.error)) {
          const failedDraft = draftStore.getDraftSession(openedDraft.draftId);
          if (failedDraft?.threadId === openedDraft.threadId) {
            draftStore.setLogicalProjectDraftThreadId(
              failedDraft.logicalProjectKey,
              scopeProjectRef(failedDraft.environmentId, failedDraft.projectId),
              openedDraft.draftId,
              { threadId: newThreadId(), createdAt: new Date().toISOString() },
            );
          }
        }
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not create terminal workspace",
            description: errorMessage(result.error),
          }),
        );
        return openedDraft;
      }
      if (result._tag === "TerminalFailure") {
        const retry = result.retry;
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Thread created, but the terminal did not open",
            description: errorMessage(result.error),
            actionProps: {
              children: "Retry",
              onClick: () => {
                void retry().then((retryResult) => {
                  if (retryResult._tag === "Failure") {
                    toastManager.add(
                      stackedThreadToast({
                        type: "error",
                        title: "Could not open terminal",
                        description: errorMessage(retryResult.error),
                      }),
                    );
                  }
                });
              },
            },
          }),
        );
      }
      return openedDraft;
    },
    [environments, materializeThread, openDraft, openTerminal, router],
  );
}

export function useHandleNewThread() {
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThread = useThread(routeThreadRef);
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const activeDraftThread = useComposerDraftStore(() =>
    routeTarget
      ? routeTarget.kind === "server"
        ? getDraftThread(routeTarget.threadRef)
        : useComposerDraftStore.getState().getDraftSession(routeTarget.draftId)
      : null,
  );
  const projects = useProjects();
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
      getPreferenceIds: (project) => [
        getProjectOrderKey(project),
        legacyProjectCwdPreferenceKey(project.workspaceRoot),
      ],
    });
  }, [projectOrder, projects]);
  const handleNewThread = useNewThreadHandler();

  return {
    activeDraftThread,
    activeThread,
    defaultProjectRef: orderedProjects[0]
      ? scopeProjectRef(orderedProjects[0].environmentId, orderedProjects[0].id)
      : null,
    handleNewThread,
    routeThreadRef,
  };
}
