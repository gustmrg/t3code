/** Optional, non-prompting compatibility check against the operator's configured Kimi Code CLI. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { describe, expect } from "vite-plus/test";

import { deleteTemporaryKimiSession, makeKimiAcpRuntime } from "./KimiAcpSupport.ts";

describe.runIf(process.env.T3_KIMI_ACP_PROBE === "1")("Kimi ACP CLI probe", () => {
  it.effect(
    "initializes, authenticates, negotiates config, and deletes its temporary session",
    () =>
      Effect.gen(function* () {
        const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const runtime = yield* makeKimiAcpRuntime({
          kimiSettings: { binaryPath: "kimi" },
          environment: process.env,
          childProcessSpawner,
          cwd: process.cwd(),
          clientInfo: { name: "t3-kimi-probe", version: "0.0.0" },
        });
        const started = yield* runtime.start();
        yield* Effect.gen(function* () {
          expect(started.initializeResult.protocolVersion).toBe(1);
          expect(started.sessionId.trim().length).toBeGreaterThan(0);
          const options = yield* runtime.getConfigOptions;
          const model = options.find((option) => option.id === "model");
          const mode = options.find((option) => option.id === "mode");
          expect(model).toBeDefined();
          expect(mode).toBeDefined();
          if (model) yield* runtime.setConfigOption(model.id, model.currentValue);
          if (mode) yield* runtime.setConfigOption(mode.id, mode.currentValue);
        }).pipe(Effect.ensuring(deleteTemporaryKimiSession(runtime, started.sessionId)));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
