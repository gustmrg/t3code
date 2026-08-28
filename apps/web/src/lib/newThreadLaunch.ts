import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { MaterializeThreadInput } from "@t3tools/client-runtime/state/threads";
import type {
  ModelSelection,
  OrchestrationThreadShell,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
  ScopedThreadRef,
  TerminalOpenInput,
  ThreadId,
} from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";

export function buildTerminalMaterializeInput(input: {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly envMode: "local" | "worktree";
  readonly projectCwd: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly startFromOrigin: boolean;
  readonly randomHex: (byteLength: number) => string;
}): MaterializeThreadInput {
  const shouldPrepareWorktree = input.envMode === "worktree" && input.worktreePath === null;
  return {
    threadId: input.threadId,
    projectId: input.projectId,
    title: "New thread",
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    branch: input.branch,
    worktreePath: input.worktreePath,
    ...(shouldPrepareWorktree
      ? {
          prepareWorktree: {
            projectCwd: input.projectCwd,
            baseBranch: input.branch ?? "HEAD",
            branch: buildTemporaryWorktreeBranchName(input.randomHex),
            ...(input.startFromOrigin && input.branch ? { startFromOrigin: true } : {}),
          },
          runSetupScript: true,
        }
      : {}),
  };
}

export type LaunchStepResult<T> =
  | { readonly _tag: "Success"; readonly value: T }
  | { readonly _tag: "Failure"; readonly error: unknown };

export type TerminalFirstLaunchResult =
  | { readonly _tag: "Success" }
  | { readonly _tag: "MaterializeFailure"; readonly error: unknown }
  | {
      readonly _tag: "TerminalFailure";
      readonly error: unknown;
      readonly retry: () => Promise<LaunchStepResult<unknown>>;
    };

export interface TerminalFirstLaunchOperations<MaterializeInput> {
  readonly materialize: (input: MaterializeInput) => Promise<LaunchStepResult<unknown>>;
  readonly waitForThreadShell: (threadRef: ScopedThreadRef) => Promise<OrchestrationThreadShell>;
  readonly navigateToThread: (threadRef: ScopedThreadRef) => Promise<void>;
  readonly openTerminal: (input: TerminalOpenInput) => Promise<LaunchStepResult<unknown>>;
  readonly terminalInput: (thread: OrchestrationThreadShell) => TerminalOpenInput;
  readonly activateTerminalWorkspace: () => void;
  readonly restoreChatWorkspace: () => void;
}

const inFlightTerminalLaunches = new Map<string, Promise<TerminalFirstLaunchResult>>();

/**
 * Materialize once per scoped thread even when two new-thread entry points race.
 * The command itself remains authoritative; this only prevents duplicate UI work.
 */
export function coordinateTerminalFirstLaunch<MaterializeInput>(input: {
  readonly threadRef: ScopedThreadRef;
  readonly materializeInput: MaterializeInput;
  readonly operations: TerminalFirstLaunchOperations<MaterializeInput>;
}): Promise<TerminalFirstLaunchResult> {
  const threadKey = scopedThreadKey(input.threadRef);
  const existing = inFlightTerminalLaunches.get(threadKey);
  if (existing) return existing;

  const launch = (async (): Promise<TerminalFirstLaunchResult> => {
    const materialized = await input.operations.materialize(input.materializeInput);
    if (materialized._tag === "Failure") {
      return { _tag: "MaterializeFailure", error: materialized.error };
    }

    const thread = await input.operations.waitForThreadShell(input.threadRef);
    await input.operations.navigateToThread(input.threadRef);
    const terminalInput = input.operations.terminalInput(thread);
    const openTerminal = () => input.operations.openTerminal(terminalInput);
    const activateTerminal = async () => {
      const opened = await openTerminal();
      if (opened._tag === "Success") input.operations.activateTerminalWorkspace();
      return opened;
    };
    const opened = await activateTerminal();
    if (opened._tag === "Failure") {
      input.operations.restoreChatWorkspace();
      return { _tag: "TerminalFailure", error: opened.error, retry: activateTerminal };
    }
    return { _tag: "Success" };
  })().finally(() => {
    if (inFlightTerminalLaunches.get(threadKey) === launch) {
      inFlightTerminalLaunches.delete(threadKey);
    }
  });
  inFlightTerminalLaunches.set(threadKey, launch);
  return launch;
}
