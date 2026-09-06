import { scopedThreadKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useTerminalPreparationStore } from "../terminalPreparationStore";
import { Button } from "./ui/button";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

export function WorkspaceLoading() {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      Loading workspace…
    </div>
  );
}

export function TerminalPreparation({ threadRef }: { threadRef: ScopedThreadRef }) {
  const preparation = useTerminalPreparationStore(
    (state) => state.byThread[scopedThreadKey(threadRef)],
  );
  const draft = useComposerDraftStore((store) => store.getDraftSessionByRef(threadRef));
  const startThread = useNewThreadHandler();
  const preparing = preparation?.status === "preparing";
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <WorkspacePageHeader>Terminal</WorkspacePageHeader>
      <div
        role={preparing ? "status" : "alert"}
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
      >
        <p>
          {preparing
            ? "Preparing terminal…"
            : (preparation?.message ?? "Terminal preparation was interrupted.")}
        </p>
        {!preparing && draft ? (
          <Button
            variant="outline"
            onClick={() => {
              if (preparation?.retry) {
                void preparation.retry();
              } else {
                void startThread(scopeProjectRef(draft.environmentId, draft.projectId), {
                  replace: true,
                });
              }
            }}
          >
            {preparation?.retry ? "Retry" : "Start new thread"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
