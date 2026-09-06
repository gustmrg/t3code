import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { TerminalWorkspaceBinding } from "./threadLaunch.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
const decodeBinding = Schema.decodeUnknownSync(TerminalWorkspaceBinding);
const encodeBinding = Schema.encodeSync(TerminalWorkspaceBinding);
const decodeCapabilities = Schema.decodeUnknownSync(
  Schema.Struct({
    terminalWorkspaceSessions: ExecutionEnvironmentCapabilities.fields.terminalWorkspaceSessions,
  }),
);
describe("terminal workspace identity", () => {
  it("round trips shell and agent startup without inventing a conversation ID", () => {
    for (const startup of [
      { _tag: "shell" as const },
      { _tag: "agent" as const, providerInstanceId: ProviderInstanceId.make("work") },
    ]) {
      const binding = { mainTerminalId: "term-7", startup };
      expect(decodeBinding(encodeBinding(binding))).toEqual(binding);
    }
  });
  it("keeps server support opt-in under version skew", () => {
    expect(ExecutionEnvironmentCapabilities.fields.terminalWorkspaceSessions).toBeDefined();
    expect(decodeCapabilities({}).terminalWorkspaceSessions === true).toBe(false);
  });
});
