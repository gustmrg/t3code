import * as Schema from "effect/Schema";

import { ProviderInstanceId } from "./providerInstance.ts";

export const DefaultThreadView = Schema.Literals(["chat", "terminal"]);
export type DefaultThreadView = typeof DefaultThreadView.Type;
export const DEFAULT_THREAD_VIEW: DefaultThreadView = "chat";

export const TerminalStartup = Schema.Union([
  Schema.TaggedStruct("shell", {}),
  Schema.TaggedStruct("agent", {
    providerInstanceId: ProviderInstanceId,
  }),
]);
export type TerminalStartup = typeof TerminalStartup.Type;
export const DEFAULT_TERMINAL_STARTUP: TerminalStartup = { _tag: "shell" };

/**
 * A project override always chooses a view. Terminal startup remains optional
 * so a terminal-first project can inherit the environment's configured agent.
 */
export const ProjectThreadLaunchPreference = Schema.Struct({
  defaultThreadView: DefaultThreadView,
  terminalStartup: Schema.optionalKey(TerminalStartup),
});
export type ProjectThreadLaunchPreference = typeof ProjectThreadLaunchPreference.Type;
