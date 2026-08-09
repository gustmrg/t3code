import * as NodeServices from "@effect/platform-node/NodeServices";
import { KimiSettings } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { buildInitialKimiProviderSnapshot, checkKimiProviderStatus } from "./KimiProvider.ts";

const decodeKimiSettings = Schema.decodeSync(KimiSettings);

describe("buildInitialKimiProviderSnapshot", () => {
  it.effect("returns disabled without probing", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(
        decodeKimiSettings({ enabled: false, customModels: ["custom-kimi"] }),
      );
      expect(snapshot).toMatchObject({
        displayName: "Kimi Code",
        enabled: false,
        status: "disabled",
        installed: false,
        badgeLabel: "Early Access",
        showInteractionModeToggle: true,
      });
      expect(snapshot.models.map((model) => model.slug)).toEqual(["custom-kimi"]);
    }),
  );

  it.effect("returns a pending Early Access snapshot", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(decodeKimiSettings({}));
      expect(snapshot.status).toBe("warning");
      expect(snapshot.message).toContain("Checking Kimi Code");
      expect(snapshot.requiresNewThreadForModelChange).toBe(false);
    }),
  );
});

it.layer(NodeServices.layer)("checkKimiProviderStatus", (it) => {
  it.effect("reports a missing binary", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkKimiProviderStatus(
        decodeKimiSettings({ binaryPath: "/definitely/not/installed/kimi" }),
      );
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toMatch(/not installed|not on PATH|Failed to execute/);
    }),
  );

  it.effect("redacts stderr from a failed version probe", () =>
    Effect.gen(function* () {
      const secret = "secret-provider-value";
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-kimi-version-" });
          const binary = path.join(dir, "kimi");
          yield* fs.writeFileString(
            binary,
            ["#!/bin/sh", `printf "%s\\n" "${secret}" >&2`, "exit 2", ""].join("\n"),
          );
          yield* fs.chmod(binary, 0o755);
          return yield* checkKimiProviderStatus(decodeKimiSettings({ binaryPath: binary }));
        }),
      );
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).not.toContain(secret);
    }),
  );

  it.effect("rejects versions below the ACP compatibility gate", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-kimi-old-" });
          const binary = path.join(dir, "kimi");
          yield* fs.writeFileString(
            binary,
            ["#!/bin/sh", 'printf "kimi 0.33.9\\n"', "exit 0", ""].join("\n"),
          );
          yield* fs.chmod(binary, 0o755);
          return yield* checkKimiProviderStatus(
            decodeKimiSettings({ binaryPath: binary, customModels: ["fallback-kimi"] }),
          );
        }),
      );
      expect(snapshot.version).toBe("0.33.9");
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toContain("0.34.0");
      expect(snapshot.models.map((model) => model.slug)).toEqual(["fallback-kimi"]);
    }),
  );
});
