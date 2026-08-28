"use client";

/** Actions that promote a right-panel surface into the primary workspace. */
export type WorkspaceAction =
  | "open-terminal"
  | "open-diff"
  | "open-files"
  | "open-preview"
  | "use-panel-workspace"
  | "restore-chat";

const EVENT_NAME = "t3code:workspace-action";
const WORKSPACE_ACTIONS = new Set<WorkspaceAction>([
  "open-terminal",
  "open-diff",
  "open-files",
  "open-preview",
  "use-panel-workspace",
  "restore-chat",
]);

export function dispatchWorkspaceAction(action: WorkspaceAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WorkspaceAction>(EVENT_NAME, { detail: action }));
}

export function subscribeWorkspaceAction(listener: (action: WorkspaceAction) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail === "string" && WORKSPACE_ACTIONS.has(detail as WorkspaceAction)) {
      listener(detail as WorkspaceAction);
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
