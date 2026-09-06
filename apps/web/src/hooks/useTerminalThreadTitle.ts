import { useEffect, useRef } from "react";
import type { ScopedThreadRef, TerminalSummary } from "@t3tools/contracts";
import { useAtomCommand } from "../state/use-atom-command";
import { threadEnvironment } from "../state/threads";

/** Only the untouched placeholder is eligible; manual titles always win. */
export function terminalThreadTitle(title: string, summary: TerminalSummary | null | undefined) {
  return title === "New thread" ? summary?.agentSession?.title || title : title;
}

/** Persist native titles through the normal metadata command so every client and search sees them. */
export function useTerminalThreadTitle(
  threadRef: ScopedThreadRef,
  title: string,
  summary: TerminalSummary | null | undefined,
) {
  const resolved = terminalThreadTitle(title, summary);
  const update = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (resolved === title || requested.current === resolved) return;
    requested.current = resolved;
    void update({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, title: resolved },
    }).then((result) => {
      if (result._tag === "Failure") requested.current = null;
    });
  }, [resolved, title, threadRef, update]);
  return resolved;
}
