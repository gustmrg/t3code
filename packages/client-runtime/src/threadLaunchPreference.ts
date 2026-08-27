import type {
  DefaultThreadView,
  ProjectThreadLaunchPreference,
  ProviderInstanceId,
  TerminalStartup,
} from "@t3tools/contracts";

export type ThreadLaunchFallback =
  | { readonly _tag: "terminal-unsupported" }
  | {
      readonly _tag: "provider-unavailable";
      readonly providerInstanceId: ProviderInstanceId;
    };

export interface EffectiveThreadLaunchPreference {
  readonly view: DefaultThreadView;
  readonly terminalStartup: TerminalStartup;
  readonly fallback: ThreadLaunchFallback | null;
}

/** Resolve stored preferences into an intent the current client can execute. */
export function resolveThreadLaunchPreference(input: {
  readonly application: {
    readonly defaultThreadView: DefaultThreadView;
    readonly terminalStartup: TerminalStartup;
  };
  readonly projectOverride?: ProjectThreadLaunchPreference | null;
  readonly terminalWorkspaceSupported: boolean;
  readonly availableProviderInstanceIds: ReadonlyArray<ProviderInstanceId>;
}): EffectiveThreadLaunchPreference {
  const requestedView =
    input.projectOverride?.defaultThreadView ?? input.application.defaultThreadView;
  if (requestedView === "chat") {
    return { view: "chat", terminalStartup: { _tag: "shell" }, fallback: null };
  }
  if (!input.terminalWorkspaceSupported) {
    return {
      view: "chat",
      terminalStartup: { _tag: "shell" },
      fallback: { _tag: "terminal-unsupported" },
    };
  }

  const terminalStartup =
    input.projectOverride?.terminalStartup ?? input.application.terminalStartup;
  if (
    terminalStartup._tag === "agent" &&
    !input.availableProviderInstanceIds.includes(terminalStartup.providerInstanceId)
  ) {
    return {
      view: "terminal",
      terminalStartup: { _tag: "shell" },
      fallback: {
        _tag: "provider-unavailable",
        providerInstanceId: terminalStartup.providerInstanceId,
      },
    };
  }

  return { view: "terminal", terminalStartup, fallback: null };
}
