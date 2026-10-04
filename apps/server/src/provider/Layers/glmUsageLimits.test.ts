// @effect-diagnostics nodeBuiltinImport:off
import * as NodeSqlite from "node:sqlite";

import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { ServerProviderUsageLimits } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { glmQuotaToLimits, readGlmUsageLimits } from "./glmUsageLimits.ts";
import { readOpenCodeUsageLimits } from "./openCodeUsageLimits.ts";

const decodeLimits = Schema.decodeUnknownSync(ServerProviderUsageLimits);

const quota = {
  code: 200,
  success: true,
  data: {
    level: "lite",
    limits: [
      { type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 2000, remaining: 1200, percentage: 40 },
      {
        type: "CREDIT_LIMIT",
        unit: 6,
        number: 1,
        usage: 10000,
        remaining: 9999,
        percentage: 1,
        nextResetTime: 1791573219983,
      },
    ],
  },
} as const;
const resets = {
  code: 200,
  success: true,
  data: {
    fiveHourResets: [
      { available: true, expireTime: "2026-10-18 20:31:48" },
      { available: true, expireTime: "2026-10-30 07:35:06" },
      { available: false, expireTime: "2026-10-30 07:35:06" },
      { available: true, expireTime: "2026-10-01 00:00:00" },
    ],
    weekResets: [{ available: true, expireTime: "2026-10-30 07:35:06" }],
  },
} as const;
const checkedAt = "2026-10-04T12:00:00.000Z";

describe("GLM Coding Plan limits", () => {
  it("maps credit windows and separate reset cards, interpreting expiry in Singapore", () => {
    const limits = decodeLimits(glmQuotaToLimits(quota, resets, checkedAt));
    expect(limits.windows[0]).toMatchObject({
      id: "glm_session",
      kind: "session",
      usedPercent: 40,
      credits: { total: 2000, remaining: 1200 },
      resetCards: { availableCount: 2, nextExpiresAt: "2026-10-18T12:31:48.000Z" },
    });
    expect(limits.windows[0]?.resetsAt).toBeUndefined();
    expect(limits.windows[1]).toMatchObject({
      id: "glm_weekly",
      kind: "weekly",
      windowDurationMins: 10080,
      resetsAt: "2026-10-09T19:13:39.983Z",
      resetCards: { availableCount: 1, nextExpiresAt: "2026-10-29T23:35:06.000Z" },
    });
    expect(limits.windows[1]?.usedPercent).toBeCloseTo(0.01);
  });

  it("distinguishes zero reset cards from unavailable inventory and ignores unknown windows", () => {
    expect(
      glmQuotaToLimits(quota, { code: 200, success: true, data: { fiveHourResets: [] } }, checkedAt)
        .windows[0]?.resetCards,
    ).toEqual({ availableCount: 0 });
    expect(glmQuotaToLimits(quota, undefined, checkedAt).windows[0]?.resetCards).toBeUndefined();
    const future = {
      ...quota,
      data: { limits: [{ type: "CREDIT_LIMIT", unit: 99, number: 1, percentage: 0 }] },
    };
    expect(glmQuotaToLimits(future, undefined, checkedAt).unavailable?.reason).toBe("probeFailed");
  });

  it.effect("keeps quota when reset inventory fails and rejects error envelopes", () =>
    Effect.gen(function* () {
      for (const failQuota of [false, true]) {
        const account = yield* readGlmUsageLimits("glm-key").pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) => {
              expect(request.headers.authorization).toBe("Bearer glm-key");
              expect(request.method).toBe("GET");
              if (request.url.includes("customer-package-reset"))
                return Effect.succeed(
                  HttpClientResponse.fromWeb(request, Response.json({}, { status: 503 })),
                );
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  Response.json(failQuota ? { code: 401, success: false } : quota),
                ),
              );
            }),
          ),
        );
        if (failQuota) expect(account.usageLimits.unavailable?.reason).toBe("probeFailed");
        else {
          expect(account.plan).toBe("GLM Lite");
          expect(account.usageLimits.windows).toHaveLength(2);
          expect(account.usageLimits.windows[0]?.resetCards).toBeUndefined();
        }
        expect(JSON.stringify(account)).not.toContain("glm-key");
      }
    }),
  );

  it.effect("reads active OpenCode 2 credentials read-only, retaining Go alongside GLM", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const root = path.join(home, "opencode");
      yield* fs.makeDirectory(root);
      yield* fs.writeFileString(
        path.join(root, "auth.json"),
        '{"zai-coding-plan":{"type":"api","key":"stale-key"}}',
      );
      yield* Effect.sync(() => {
        const db = new NodeSqlite.DatabaseSync(path.join(root, "opencode.db"));
        try {
          db.exec(
            "CREATE TABLE credential (integration_id TEXT, value TEXT, active INTEGER, time_updated INTEGER)",
          );
          const insert = db.prepare("INSERT INTO credential VALUES (?, ?, ?, ?)");
          insert.run("zai-coding-plan", JSON.stringify({ type: "key", key: "glm-key" }), 1, 2);
          insert.run("zai-coding-plan", JSON.stringify({ type: "key", key: "inactive-key" }), 0, 3);
          insert.run("opencode-go", "invalid-json", 1, 4);
          insert.run("opencode-go", JSON.stringify({ type: "key", key: "go-key" }), 1, 1);
        } finally {
          db.close();
        }
      });
      const limits = yield* readOpenCodeUsageLimits({
        enabled: true,
        serverUrl: "",
        generation: "v2",
        environment: { XDG_DATA_HOME: home },
      }).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            const go = request.url.includes("opencode.ai");
            expect(request.headers.authorization).toBe(go ? "Bearer go-key" : "Bearer glm-key");
            const resetsAt = "2026-10-09T00:00:00.000Z";
            const body = go
              ? {
                  usage: {
                    rolling: { percent: 20, resetsAt },
                    weekly: { percent: 30, resetsAt },
                    monthly: { percent: 40, resetsAt },
                  },
                }
              : request.url.includes("customer-package-reset")
                ? resets
                : quota;
            return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body)));
          }),
        ),
      );
      expect(limits.windows).toHaveLength(3);
      expect(limits.additionalAccounts?.[0]?.usageLimits.windows).toHaveLength(2);
      expect(limits.additionalAccounts?.[0]?.usageLimits.credentialFingerprint).not.toBe(
        limits.credentialFingerprint,
      );
      expect(decodeLimits(limits)).toEqual(limits);
      expect(JSON.stringify(limits)).not.toContain("glm-key");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reads an existing OpenCode 1 GLM login without requiring a Go subscription", () =>
    Effect.gen(function* () {
      const limits = yield* readOpenCodeUsageLimits({
        enabled: true,
        serverUrl: "",
        generation: "v1",
        environment: {
          OPENCODE_AUTH_CONTENT: '{"zai-coding-plan":{"type":"api","key":"glm-key"}}',
        },
      }).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            expect(request.url).toContain("api.z.ai");
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json(request.url.includes("customer-package-reset") ? resets : quota),
              ),
            );
          }),
        ),
        Effect.provide(NodeServices.layer),
      );
      expect(limits.unavailable?.reason).toBe("unsupported");
      expect(limits.additionalAccounts?.[0]?.usageLimits.windows).toHaveLength(2);
    }),
  );
});
