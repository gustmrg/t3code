// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { KimiSettings, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { expect } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import * as TextGeneration from "./TextGeneration.ts";
import { makeKimiTextGeneration } from "./KimiTextGeneration.ts";

const decodeKimiSettings = Schema.decodeSync(KimiSettings);
const TestLayer = ServerConfig.ServerConfig.layerTest(process.cwd(), {
  prefix: "t3code-kimi-text-generation-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const mockAgentSource = String.raw`
const readline = require("node:readline");
const fs = require("node:fs");
const sessionId = "temporary-kimi-session";
let model = "kimi-k2.5";
let mode = "default";
const options = () => [
  { id: "model", name: "Model", type: "select", currentValue: model, options: [
    { value: "kimi-k2.5", name: "Kimi K2.5" },
    { value: "kimi-test", name: "Kimi Test" }
  ] },
  { id: "thinking", name: "Thinking", type: "boolean", currentValue: true },
  { id: "mode", name: "Mode", type: "select", currentValue: mode, options: [
    { value: "default", name: "Default" }, { value: "plan", name: "Plan" },
    { value: "yolo", name: "YOLO" }
  ] }
];
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (process.env.T3_REQUEST_LOG) fs.appendFileSync(process.env.T3_REQUEST_LOG, request.method + "\n");
  let result = {};
  if (request.method === "initialize") result = {
    protocolVersion: 1,
    agentCapabilities: { loadSession: true, promptCapabilities: { image: true, embeddedContext: true } }
  };
  else if (request.method === "session/new") result = { sessionId, configOptions: options() };
  else if (request.method === "session/set_config_option") {
    if (request.params.configId === "model") model = request.params.value;
    if (request.params.configId === "mode") mode = request.params.value;
    result = { configOptions: options() };
  } else if (request.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId, update: { sessionUpdate: "agent_message_chunk", content: {
        type: "text", text: process.env.T3_OUTPUT || ""
      } }
    } });
    result = { stopReason: "end_turn" };
  }
  send({ jsonrpc: "2.0", id: request.id, result });
});
`;

function makeFakeKimi(dir: string, output: string): { binary: string; log: string } {
  const binary = NodePath.join(dir, "kimi");
  const log = NodePath.join(dir, "requests.log");
  NodeFS.writeFileSync(
    binary,
    [
      "#!/bin/sh",
      'test "$1" = "acp" || exit 11',
      `export T3_OUTPUT=${shellQuote(output)}`,
      `export T3_REQUEST_LOG=${shellQuote(log)}`,
      `exec ${shellQuote(process.execPath)} -e ${shellQuote(mockAgentSource)}`,
      "",
    ].join("\n"),
  );
  NodeFS.chmodSync(binary, 0o755);
  return { binary, log };
}

function withKimiTextGeneration<A, E, R>(
  output: string,
  use: (service: TextGeneration.TextGeneration["Service"], log: string) => Effect.Effect<A, E, R>,
) {
  return Effect.gen(function* () {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-kimi-text-"));
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => NodeFS.rmSync(dir, { recursive: true, force: true })),
    );
    const { binary, log } = makeFakeKimi(dir, output);
    const service = yield* makeKimiTextGeneration(decodeKimiSettings({ binaryPath: binary }));
    return yield* use(service, log);
  }).pipe(Effect.scoped);
}

const selection = createModelSelection(ProviderInstanceId.make("kimi"), "kimi-test");

it.layer(TestLayer)("KimiTextGeneration", (it) => {
  it.effect("generates commit content and deletes the temporary session", () =>
    withKimiTextGeneration(
      JSON.stringify({ subject: "Add Kimi", body: "ACP support." }),
      (svc, log) =>
        Effect.gen(function* () {
          const result = yield* svc.generateCommitMessage({
            cwd: process.cwd(),
            branch: "feat/kimi",
            stagedSummary: "summary",
            stagedPatch: "patch",
            modelSelection: selection,
          });
          expect(result).toEqual({ subject: "Add Kimi", body: "ACP support." });
          expect(NodeFS.readFileSync(log, "utf8").match(/session\/delete/g)).toHaveLength(1);
        }),
    ),
  );

  it.effect("supports PR, branch, and thread-title operations", () =>
    Effect.gen(function* () {
      yield* withKimiTextGeneration(JSON.stringify({ title: "Add Kimi", body: "Summary" }), (svc) =>
        Effect.map(
          svc.generatePrContent({
            cwd: process.cwd(),
            baseBranch: "main",
            headBranch: "feat/kimi",
            commitSummary: "summary",
            diffSummary: "diff",
            diffPatch: "patch",
            modelSelection: selection,
          }),
          (result) => expect(result.title).toBe("Add Kimi"),
        ),
      );
      yield* withKimiTextGeneration(JSON.stringify({ branch: "feat/kimi-code" }), (svc) =>
        Effect.map(
          svc.generateBranchName({
            cwd: process.cwd(),
            message: "add kimi",
            modelSelection: selection,
          }),
          (result) => expect(result.branch).toBe("feat/kimi-code"),
        ),
      );
      yield* withKimiTextGeneration(JSON.stringify({ title: "Kimi provider" }), (svc) =>
        Effect.map(
          svc.generateThreadTitle({
            cwd: process.cwd(),
            message: "add kimi",
            modelSelection: selection,
          }),
          (result) => expect(result.title).toBe("Kimi provider"),
        ),
      );
    }),
  );

  it.effect("fails invalid output and still deletes exactly once", () =>
    withKimiTextGeneration("not json", (svc, log) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          svc.generateThreadTitle({
            cwd: process.cwd(),
            message: "add kimi",
            modelSelection: selection,
          }),
        );
        expect(error._tag).toBe("TextGenerationError");
        expect(NodeFS.readFileSync(log, "utf8").match(/session\/delete/g)).toHaveLength(1);
      }),
    ),
  );
});
