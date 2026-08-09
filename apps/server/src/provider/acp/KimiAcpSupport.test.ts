import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  applyKimiSessionConfiguration,
  buildKimiAcpSpawnInput,
  currentKimiModelFromConfigOptions,
  deleteKimiSession,
  discoverKimiModelsFromRuntime,
  kimiModelsFromConfigOptions,
  kimiThinkingDescriptorFromConfigOptions,
  KIMI_AUTH_METHOD_ID,
  resolveKimiMode,
} from "./KimiAcpSupport.ts";

const configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> = [
  {
    id: "model",
    name: "Model",
    type: "select",
    currentValue: "kimi-k2.5",
    options: [
      { value: "kimi-k2.5", name: "Kimi K2.5" },
      { value: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo" },
    ],
  },
  {
    id: "thinking",
    name: "Thinking",
    description: "How much reasoning Kimi should use.",
    type: "select",
    currentValue: "high",
    options: [
      { value: "off", name: "Thinking Off" },
      { value: "low", name: "Thinking Low" },
      { value: "high", name: "Thinking High" },
      { value: "max", name: "Thinking Max" },
    ],
  },
  {
    id: "mode",
    name: "Mode",
    type: "select",
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "plan", name: "Plan" },
      { value: "yolo", name: "YOLO" },
    ],
  },
];

describe("Kimi ACP support", () => {
  it("builds the Kimi ACP launch and login handshake configuration", () => {
    expect(KIMI_AUTH_METHOD_ID).toBe("login");
    expect(buildKimiAcpSpawnInput(undefined, "/repo")).toEqual({
      command: "kimi",
      args: ["acp"],
      cwd: "/repo",
    });
    expect(buildKimiAcpSpawnInput({ binaryPath: "/opt/kimi" }, "/repo", { TEST: "1" })).toEqual({
      command: "/opt/kimi",
      args: ["acp"],
      cwd: "/repo",
      env: { TEST: "1" },
    });
  });

  it("extracts negotiated models and marks the current model default", () => {
    expect(currentKimiModelFromConfigOptions(configOptions)).toBe("kimi-k2.5");
    expect(kimiModelsFromConfigOptions(configOptions)).toMatchObject([
      { slug: "kimi-k2.5", name: "Kimi K2.5", isDefault: true },
      { slug: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo" },
    ]);
    expect(kimiModelsFromConfigOptions(configOptions)[0]?.capabilities).toEqual({
      optionDescriptors: [
        {
          id: "thinking",
          label: "Thinking",
          description: "How much reasoning Kimi should use.",
          type: "select",
          currentValue: "high",
          options: [
            { id: "off", label: "Thinking Off" },
            { id: "low", label: "Thinking Low" },
            { id: "high", label: "Thinking High", isDefault: true },
            { id: "max", label: "Thinking Max" },
          ],
        },
      ],
    });
    expect(kimiModelsFromConfigOptions(configOptions)[1]?.capabilities).toEqual({
      optionDescriptors: [],
    });
  });

  it("normalizes grouped thinking choices and drops blanks and duplicates", () => {
    const grouped: ReadonlyArray<EffectAcpSchema.SessionConfigOption> = [
      {
        id: "thinking",
        name: " Thinking ",
        type: "select",
        currentValue: "max",
        options: [
          {
            group: "Effort",
            name: "Effort",
            options: [
              { value: " low ", name: " Low " },
              { value: "", name: "Blank" },
              { value: "low", name: "Duplicate" },
              { value: "max", name: "Max", description: " Deepest reasoning " },
            ],
          },
        ],
      },
    ];

    expect(kimiThinkingDescriptorFromConfigOptions(grouped)).toEqual({
      id: "thinking",
      label: "Thinking",
      type: "select",
      currentValue: "max",
      options: [
        { id: "low", label: "Low" },
        { id: "max", label: "Max", description: "Deepest reasoning", isDefault: true },
      ],
    });
    expect(kimiThinkingDescriptorFromConfigOptions([])).toBeUndefined();
  });

  it.effect("discovers model-dependent thinking choices serially", () =>
    Effect.gen(function* () {
      let currentModel = "kimi-k2.5";
      const calls: Array<[string, string | boolean]> = [];
      const currentConfigOptions = (): ReadonlyArray<EffectAcpSchema.SessionConfigOption> => [
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: currentModel,
          options: [
            { value: "kimi-k2.5", name: "Kimi K2.5" },
            { value: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo" },
          ],
        },
        currentModel === "kimi-k2.5"
          ? configOptions[1]!
          : {
              id: "thinking",
              name: "Thinking",
              type: "select",
              currentValue: "on",
              options: [
                { value: "off", name: "Thinking Off" },
                { value: "on", name: "Thinking On" },
              ],
            },
        configOptions[2]!,
      ];

      const models = yield* discoverKimiModelsFromRuntime({
        getConfigOptions: Effect.sync(currentConfigOptions),
        setConfigOption: (id, value) =>
          Effect.sync(() => {
            calls.push([id, value]);
            if (id === "model" && typeof value === "string") currentModel = value;
            return { configOptions: currentConfigOptions() };
          }),
      });

      expect(calls).toEqual([
        ["model", "kimi-k2.5"],
        ["model", "kimi-k2-turbo-preview"],
      ]);
      expect(models.map(({ slug, isDefault }) => ({ slug, isDefault }))).toEqual([
        { slug: "kimi-k2.5", isDefault: true },
        { slug: "kimi-k2-turbo-preview", isDefault: undefined },
      ]);
      expect(models[0]?.capabilities?.optionDescriptors?.[0]).toMatchObject({
        id: "thinking",
        currentValue: "high",
      });
      expect(models[1]?.capabilities?.optionDescriptors?.[0]).toMatchObject({
        id: "thinking",
        currentValue: "on",
        options: [
          { id: "off", label: "Thinking Off" },
          { id: "on", label: "Thinking On", isDefault: true },
        ],
      });
    }),
  );

  it("maps all T3 modes exactly", () => {
    expect(resolveKimiMode({ interactionMode: "plan", runtimeMode: "full-access" })).toBe("plan");
    expect(resolveKimiMode({ interactionMode: "default", runtimeMode: "approval-required" })).toBe(
      "default",
    );
    expect(resolveKimiMode({ interactionMode: "default", runtimeMode: "full-access" })).toBe(
      "yolo",
    );
  });

  it.effect("applies model, optional thinking, and mode by negotiated ids", () =>
    Effect.gen(function* () {
      const calls: Array<[string, string | boolean]> = [];
      yield* applyKimiSessionConfiguration({
        runtime: {
          getConfigOptions: Effect.succeed(configOptions),
          setConfigOption: (id, value) =>
            Effect.sync(() => {
              calls.push([id, value]);
              return { configOptions };
            }),
        },
        model: "kimi-k2-turbo-preview",
        selections: [{ id: "thinking", value: "high" }],
        interactionMode: "default",
        runtimeMode: "full-access",
        mapError: (error) => error,
      });
      expect(calls).toEqual([
        ["model", "kimi-k2-turbo-preview"],
        ["thinking", "high"],
        ["mode", "yolo"],
      ]);
    }),
  );

  it.effect("inherits Kimi thinking when no selection is provided", () =>
    Effect.gen(function* () {
      const calls: Array<[string, string | boolean]> = [];
      yield* applyKimiSessionConfiguration({
        runtime: {
          getConfigOptions: Effect.succeed(
            configOptions.filter((option) => option.id !== "thinking"),
          ),
          setConfigOption: (id, value) =>
            Effect.sync(() => {
              calls.push([id, value]);
              return { configOptions };
            }),
        },
        model: undefined,
        selections: undefined,
        interactionMode: "default",
        runtimeMode: "approval-required",
        mapError: (error) => error,
      });
      expect(calls).toEqual([["mode", "default"]]);
    }),
  );

  it.effect("rejects a stale or unnegotiated thinking selection", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyKimiSessionConfiguration({
          runtime: {
            getConfigOptions: Effect.succeed(
              configOptions.filter((option) => option.id !== "thinking"),
            ),
            setConfigOption: () => Effect.die("must not send"),
          },
          model: undefined,
          selections: [{ id: "thinking", value: "max" }],
          interactionMode: "default",
          runtimeMode: "approval-required",
          mapError: (cause) => cause,
        }),
      );
      expect(error).toBeInstanceOf(EffectAcpErrors.AcpRequestError);
      expect(error.message).toContain("thinking value 'max'");
    }),
  );

  it.effect("rejects an unnegotiated requested model", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        applyKimiSessionConfiguration({
          runtime: {
            getConfigOptions: Effect.succeed([]),
            setConfigOption: () => Effect.die("must not send"),
          },
          model: "unknown",
          selections: [],
          interactionMode: "default",
          runtimeMode: "approval-required",
          mapError: (cause) => cause,
        }),
      );
      expect(error).toBeInstanceOf(EffectAcpErrors.AcpRequestError);
    }),
  );

  it.effect("sends exactly one typed delete request", () =>
    Effect.gen(function* () {
      const calls: Array<{ method: string; payload: unknown }> = [];
      yield* deleteKimiSession(
        {
          request: (method, payload) =>
            Effect.sync(() => {
              calls.push({ method, payload });
              return {};
            }),
        },
        "temporary-session",
      );
      expect(calls).toEqual([
        { method: "session/delete", payload: { sessionId: "temporary-session" } },
      ]);
    }),
  );
});
