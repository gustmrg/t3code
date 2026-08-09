import {
  type KimiSettings,
  type ModelCapabilities,
  type ProviderInteractionMode,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type RuntimeMode,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

export const KIMI_MINIMUM_ACP_VERSION = "0.34.0";
export const KIMI_AUTH_METHOD_ID = "login";

type KimiAcpRuntimeSettings = Pick<KimiSettings, "binaryPath">;

export interface KimiAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly kimiSettings: KimiAcpRuntimeSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildKimiAcpSpawnInput(
  kimiSettings: KimiAcpRuntimeSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  return {
    command: kimiSettings?.binaryPath || "kimi",
    args: ["acp"],
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

export const makeKimiAcpRuntime = (
  input: KimiAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildKimiAcpSpawnInput(input.kimiSettings, input.cwd, input.environment),
        authMethodId: KIMI_AUTH_METHOD_ID,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

interface SelectValue {
  readonly value: string;
  readonly name: string;
  readonly description?: string;
}

const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({ optionDescriptors: [] });

function trimOptional(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

function toSelectValue(option: EffectAcpSchema.SessionConfigSelectOption): SelectValue {
  const description = trimOptional(option.description);
  return {
    value: option.value.trim(),
    name: option.name.trim(),
    ...(description ? { description } : {}),
  };
}

function flattenSelectValues(
  option: EffectAcpSchema.SessionConfigOption | undefined,
): ReadonlyArray<SelectValue> {
  if (!option || option.type !== "select") return [];
  return option.options.flatMap((entry) =>
    "value" in entry ? [toSelectValue(entry)] : entry.options.map(toSelectValue),
  );
}

export function findKimiConfigOption(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
  id: "model" | "thinking" | "mode",
): EffectAcpSchema.SessionConfigOption | undefined {
  return configOptions.find((option) => option.id.trim() === id);
}

export function kimiThinkingDescriptorFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
): ProviderOptionDescriptor | undefined {
  const thinkingOption = findKimiConfigOption(configOptions, "thinking");
  if (!thinkingOption || thinkingOption.type !== "select") return undefined;

  const currentValue = thinkingOption.currentValue.trim();
  const description = trimOptional(thinkingOption.description);
  const seen = new Set<string>();
  const options = flattenSelectValues(thinkingOption).flatMap((choice) => {
    if (!choice.value || seen.has(choice.value)) return [];
    seen.add(choice.value);
    return [
      {
        id: choice.value,
        label: choice.name || choice.value,
        ...(choice.description ? { description: choice.description } : {}),
        ...(choice.value === currentValue ? { isDefault: true } : {}),
      },
    ];
  });
  if (options.length === 0) return undefined;

  return {
    id: "thinking",
    label: thinkingOption.name.trim() || "Thinking",
    type: "select",
    options,
    ...(options.some((option) => option.id === currentValue) ? { currentValue } : {}),
    ...(description ? { description } : {}),
  };
}

export function kimiModelsFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
): ReadonlyArray<ServerProviderModel> {
  const modelOption = findKimiConfigOption(configOptions, "model");
  const current =
    modelOption?.type === "select" ? modelOption.currentValue?.trim() || undefined : undefined;
  const thinkingDescriptor = kimiThinkingDescriptorFromConfigOptions(configOptions);
  const currentCapabilities = createModelCapabilities({
    optionDescriptors: thinkingDescriptor ? [thinkingDescriptor] : [],
  });
  const seen = new Set<string>();
  return flattenSelectValues(modelOption)
    .filter((model) => {
      if (model.value.length === 0 || seen.has(model.value)) return false;
      seen.add(model.value);
      return true;
    })
    .map((model) => ({
      slug: model.value,
      name: model.name || model.value,
      isCustom: false,
      ...(model.value === current ? { isDefault: true } : {}),
      capabilities: model.value === current ? currentCapabilities : EMPTY_CAPABILITIES,
    }));
}

export function discoverKimiModelsFromRuntime(
  runtime: Pick<
    AcpSessionRuntime.AcpSessionRuntime["Service"],
    "getConfigOptions" | "setConfigOption"
  >,
): Effect.Effect<ReadonlyArray<ServerProviderModel>, EffectAcpErrors.AcpError> {
  return Effect.gen(function* () {
    const initialConfigOptions = yield* runtime.getConfigOptions;
    const defaultModel = currentKimiModelFromConfigOptions(initialConfigOptions);
    const advertisedModels = kimiModelsFromConfigOptions(initialConfigOptions);

    return yield* Effect.forEach(
      advertisedModels,
      (advertisedModel) =>
        Effect.gen(function* () {
          yield* runtime.setConfigOption("model", advertisedModel.slug);
          const selectedModel = kimiModelsFromConfigOptions(yield* runtime.getConfigOptions).find(
            (model) => model.slug === advertisedModel.slug,
          );
          if (!selectedModel) {
            return yield* Effect.fail(
              EffectAcpErrors.AcpRequestError.invalidParams(
                `Kimi ACP did not retain advertised model '${advertisedModel.slug}' during discovery.`,
              ),
            );
          }
          const { isDefault: _selectedDefault, ...model } = selectedModel;
          return advertisedModel.slug === defaultModel ? { ...model, isDefault: true } : model;
        }),
      { concurrency: 1 },
    );
  });
}

export function currentKimiModelFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
): string | undefined {
  const option = findKimiConfigOption(configOptions, "model");
  return option?.type === "select" ? option.currentValue?.trim() || undefined : undefined;
}

export function resolveKimiMode(input: {
  readonly interactionMode: ProviderInteractionMode | undefined;
  readonly runtimeMode: RuntimeMode;
}): "default" | "plan" | "yolo" {
  if (input.interactionMode === "plan") return "plan";
  return input.runtimeMode === "full-access" ? "yolo" : "default";
}

export function applyKimiSessionConfiguration<E>(input: {
  readonly runtime: Pick<
    AcpSessionRuntime.AcpSessionRuntime["Service"],
    "getConfigOptions" | "setConfigOption"
  >;
  readonly model: string | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  readonly interactionMode: ProviderInteractionMode | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly mapError: (cause: EffectAcpErrors.AcpError) => E;
}): Effect.Effect<void, E> {
  return Effect.gen(function* () {
    const configOptions = yield* input.runtime.getConfigOptions;
    if (input.model) {
      const model = findKimiConfigOption(configOptions, "model");
      if (!model) {
        return yield* Effect.fail(
          input.mapError(
            EffectAcpErrors.AcpRequestError.invalidParams(
              "Kimi ACP did not negotiate a model configuration option.",
            ),
          ),
        );
      }
      yield* input.runtime
        .setConfigOption("model", input.model)
        .pipe(Effect.mapError(input.mapError));
    }

    const thinking = input.selections?.find((selection) => selection.id === "thinking");
    if (thinking !== undefined) {
      const thinkingOption = findKimiConfigOption(
        yield* input.runtime.getConfigOptions,
        "thinking",
      );
      const requestedThinking = typeof thinking.value === "string" ? thinking.value.trim() : "";
      const allowedThinkingValues = new Set(
        flattenSelectValues(thinkingOption).map((choice) => choice.value),
      );
      if (
        thinkingOption?.type !== "select" ||
        !requestedThinking ||
        !allowedThinkingValues.has(requestedThinking)
      ) {
        return yield* Effect.fail(
          input.mapError(
            EffectAcpErrors.AcpRequestError.invalidParams(
              `Kimi ACP does not support thinking value '${String(thinking.value)}' for the selected model.`,
            ),
          ),
        );
      }
      yield* input.runtime
        .setConfigOption("thinking", requestedThinking)
        .pipe(Effect.mapError(input.mapError));
    }

    yield* input.runtime
      .setConfigOption(
        "mode",
        resolveKimiMode({
          interactionMode: input.interactionMode,
          runtimeMode: input.runtimeMode,
        }),
      )
      .pipe(Effect.mapError(input.mapError));
  });
}

export const KimiDeleteSessionResponse = Schema.Struct({});
export type KimiDeleteSessionResponse = typeof KimiDeleteSessionResponse.Type;

const decodeDeleteSessionResponse = Schema.decodeUnknownEffect(KimiDeleteSessionResponse);

export function deleteKimiSession(
  runtime: Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "request">,
  sessionId: string,
): Effect.Effect<KimiDeleteSessionResponse, EffectAcpErrors.AcpError | Schema.SchemaError> {
  return runtime
    .request("session/delete", { sessionId })
    .pipe(Effect.flatMap(decodeDeleteSessionResponse));
}

export function deleteTemporaryKimiSession(
  runtime: Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "request">,
  sessionId: string,
): Effect.Effect<void> {
  return deleteKimiSession(runtime, sessionId).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Failed to delete a temporary Kimi ACP session.", {
        errorTag: "KimiSessionDeleteFailure",
        cause,
      }),
    ),
    Effect.asVoid,
  );
}
