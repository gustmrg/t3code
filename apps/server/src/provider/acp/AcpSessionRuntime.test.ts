// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(__dirname, "../../../scripts/acp-mock-agent.ts");

const runtimeLayer = (requestEvents: Array<AcpSessionRuntime.AcpSessionRequestLogEvent>) =>
  AcpSessionRuntime.layer({
    authMethodId: "test",
    spawn: { command: "node", args: [mockAgentPath] },
    cwd: process.cwd(),
    clientCapabilities: { _meta: { parameterizedModelPicker: true } },
    clientInfo: { name: "t3-test", version: "0.0.0" },
    requestLogger: (event) => Effect.sync(() => requestEvents.push(event)),
  });

describe("AcpSessionRuntime configuration snapshots", () => {
  it.effect("replaces the snapshot with the authoritative set-config response", () => {
    const requests: Array<AcpSessionRuntime.AcpSessionRequestLogEvent> = [];
    return Effect.gen(function* () {
      const runtime = yield* AcpSessionRuntime.AcpSessionRuntime;
      yield* runtime.start();
      yield* runtime.setConfigOption("model", "composer-2");

      const options = yield* runtime.getConfigOptions;
      expect(options.find((option) => option.id === "model")?.currentValue).toBe("composer-2");
      expect(options.find((option) => option.id === "fast")).toBeDefined();
    }).pipe(
      Effect.provide(runtimeLayer(requests)),
      Effect.scoped,
      Effect.provide(NodeServices.layer),
    );
  });

  it.effect("does not send duplicate no-op writes and rejects invalid values first", () => {
    const requests: Array<AcpSessionRuntime.AcpSessionRequestLogEvent> = [];
    return Effect.gen(function* () {
      const runtime = yield* AcpSessionRuntime.AcpSessionRuntime;
      yield* runtime.start();
      yield* runtime.setConfigOption("model", "default");
      yield* Effect.flip(runtime.setConfigOption("model", "not-negotiated"));

      expect(
        requests.filter(
          (event) => event.method === "session/set_config_option" && event.status === "started",
        ),
      ).toHaveLength(0);
    }).pipe(
      Effect.provide(runtimeLayer(requests)),
      Effect.scoped,
      Effect.provide(NodeServices.layer),
    );
  });

  it("extracts an inbound authoritative config-option update", () => {
    const configOptions = [
      {
        id: "mode",
        name: "Mode",
        type: "select" as const,
        currentValue: "plan",
        options: [{ value: "plan", name: "Plan" }],
      },
    ];
    expect(
      AcpSessionRuntime.configOptionsFromSessionUpdate({
        sessionId: "session-1",
        update: { sessionUpdate: "config_option_update", configOptions },
      }),
    ).toEqual(configOptions);
  });
});
