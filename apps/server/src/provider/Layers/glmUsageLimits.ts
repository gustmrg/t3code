import * as NodeCrypto from "node:crypto";

import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { clampPercent, makeUnavailableUsageLimits } from "../providerUsageLimits.ts";

const QuotaResponse = Schema.Struct({
  code: Schema.Literal(200),
  success: Schema.Literal(true),
  data: Schema.Struct({
    level: Schema.optional(Schema.String),
    limits: Schema.Array(
      Schema.Struct({
        type: Schema.String,
        unit: Schema.Number,
        number: Schema.optional(Schema.Number),
        usage: Schema.optional(Schema.Finite),
        remaining: Schema.optional(Schema.Finite),
        percentage: Schema.optional(Schema.Finite),
        nextResetTime: Schema.optional(Schema.NullOr(Schema.Finite)),
      }),
    ),
  }),
});
const ResetCard = Schema.Struct({
  available: Schema.Boolean,
  expireTime: Schema.optional(Schema.NullOr(Schema.String)),
});
const ResetResponse = Schema.Struct({
  code: Schema.Literal(200),
  success: Schema.Literal(true),
  data: Schema.Struct({
    fiveHourResets: Schema.optional(Schema.Array(ResetCard)),
    weekResets: Schema.optional(Schema.Array(ResetCard)),
  }),
});

/** Z.ai's timezone-less expiry strings are on the Singapore clock, not the host's clock. */
function cardExpiry(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return undefined;
  const parsed = DateTime.make(`${value.replace(" ", "T")}+08:00`);
  return Option.isSome(parsed) ? DateTime.formatIso(parsed.value) : undefined;
}

function resetCards(cards: readonly (typeof ResetCard.Type)[] | undefined, checkedAt: string) {
  if (cards === undefined) return undefined;
  const now = DateTime.toEpochMillis(DateTime.makeUnsafe(checkedAt));
  const available = cards.flatMap((card) => {
    if (!card.available) return [];
    const expiry = cardExpiry(card.expireTime);
    return expiry && DateTime.toEpochMillis(DateTime.makeUnsafe(expiry)) <= now ? [] : [{ expiry }];
  });
  const nextExpiresAt = available
    .flatMap((card) => (card.expiry ? [card.expiry] : []))
    .toSorted()[0];
  return { availableCount: available.length, ...(nextExpiresAt ? { nextExpiresAt } : {}) };
}

export function glmQuotaToLimits(
  response: typeof QuotaResponse.Type,
  resets: typeof ResetResponse.Type | undefined,
  checkedAt: string,
): ServerProviderUsageLimits {
  const windows: ServerProviderUsageWindow[] = response.data.limits.flatMap((limit) => {
    if (!["CREDIT_LIMIT", "TOKENS_LIMIT", "TIME_LIMIT"].includes(limit.type)) return [];
    const kind =
      limit.unit === 3 && (limit.number === undefined || limit.number === 5)
        ? "session"
        : limit.unit === 6 && (limit.number === undefined || limit.number === 1)
          ? "weekly"
          : limit.unit === 5 && limit.type === "TIME_LIMIT"
            ? "monthly"
            : undefined;
    if (!kind) return [];
    const total = limit.usage;
    const remaining = limit.remaining;
    // The percentage is coarse: one credit out of 10,000 can report 1%.
    const hasCredits =
      limit.type === "CREDIT_LIMIT" &&
      total !== undefined &&
      total > 0 &&
      remaining !== undefined &&
      remaining >= 0;
    const usedPercent = hasCredits ? clampPercent((1 - remaining / total) * 100) : limit.percentage;
    if (usedPercent === undefined) return [];
    const reset = limit.nextResetTime ? DateTime.make(limit.nextResetTime) : Option.none();
    const cards =
      kind === "session"
        ? resets?.data.fiveHourResets
        : kind === "weekly"
          ? resets?.data.weekResets
          : undefined;
    return [
      {
        id: `glm_${kind}`,
        kind,
        label: kind === "session" ? "5 hours" : kind === "weekly" ? "Weekly" : "Monthly tools",
        usedPercent: clampPercent(usedPercent),
        ...(kind === "session"
          ? { windowDurationMins: 300 }
          : kind === "weekly"
            ? { windowDurationMins: 10080 }
            : {}),
        ...(Option.isSome(reset) ? { resetsAt: DateTime.formatIso(reset.value) } : {}),
        ...(hasCredits ? { credits: { total, remaining: Math.min(total, remaining) } } : {}),
        ...(cards === undefined ? {} : { resetCards: resetCards(cards, checkedAt) }),
      },
    ];
  });
  return {
    checkedAt,
    service: "GLM Coding Plan",
    windows,
    ...(windows.length
      ? {}
      : {
          unavailable: {
            reason: "probeFailed",
            message: "Z.ai reported no recognized quota windows.",
          },
        }),
  };
}

/** Reads quota and reset-card inventory only; never grants or spends reset cards. */
export const readGlmUsageLimits = Effect.fn("readGlmUsageLimits")(function* (apiKey: string) {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const credentialFingerprint = NodeCrypto.createHash("sha256")
    .update("zai-coding-plan\0")
    .update(apiKey)
    .digest("hex");
  const client = yield* HttpClient.HttpClient;
  const get = (path: string) =>
    client
      .execute(
        HttpClientRequest.get(`https://api.z.ai/api/${path}`).pipe(
          HttpClientRequest.bearerToken(apiKey),
        ),
      )
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk), Effect.timeout("5 seconds"));
  return yield* Effect.gen(function* () {
    const { quota, resets } = yield* Effect.all(
      {
        quota: get("monitor/usage/quota/limit").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(QuotaResponse)),
        ),
        resets: get("biz/customer-package-reset/list?targetType=PERSONAL").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ResetResponse)),
          Effect.orElseSucceed(() => undefined),
        ),
      },
      { concurrency: "unbounded" },
    );
    return {
      id: "zai-coding-plan",
      label: "GLM Coding Plan",
      ...(quota.data.level
        ? {
            plan: `GLM ${quota.data.level.charAt(0).toUpperCase()}${quota.data.level.slice(1).toLowerCase()}`,
          }
        : {}),
      usageLimits: {
        ...glmQuotaToLimits(quota, resets, checkedAt),
        credentialFingerprint,
      },
    };
  }).pipe(
    Effect.orElseSucceed(() => ({
      id: "zai-coding-plan",
      label: "GLM Coding Plan",
      plan: undefined,
      usageLimits: {
        ...makeUnavailableUsageLimits({
          checkedAt,
          reason: "probeFailed",
          message: "Z.ai could not read GLM Coding Plan usage.",
        }),
        service: "GLM Coding Plan",
        credentialFingerprint,
      },
    })),
  );
});
