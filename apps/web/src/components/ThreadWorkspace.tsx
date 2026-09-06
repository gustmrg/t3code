import type { ComponentProps } from "react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useThreadShell } from "../state/entities";
import ChatView from "./ChatView";
import { WorkspaceLoading } from "./TerminalPreparation";
import { ThreadTerminalWorkspace } from "./ThreadTerminalWorkspace";

/** Choose the workspace before mounting any chat subscriptions or effects. */
export function ThreadWorkspace(
  props: Extract<ComponentProps<typeof ChatView>, { routeKind: "server" }>,
) {
  const ref = scopeThreadRef(props.environmentId, props.threadId);
  const shell = useThreadShell(ref);
  if (!shell) return <WorkspaceLoading />;
  return shell.terminalWorkspace ? (
    <ThreadTerminalWorkspace
      key={scopedThreadKey(ref)}
      threadRef={ref}
      binding={shell.terminalWorkspace}
    />
  ) : (
    <ChatView {...props} />
  );
}
