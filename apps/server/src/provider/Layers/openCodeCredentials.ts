// OpenCode 2 keeps API credentials in its own live database, opened read-only here.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeOS from "node:os";
import * as NodeSqlite from "node:sqlite";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const ApiCredential = Schema.Struct({
  type: Schema.Literals(["api", "key"]),
  key: Schema.String,
});
const decodeCredential = Schema.decodeUnknownOption(ApiCredential);
const AuthFile = Schema.Record(Schema.String, Schema.Unknown);
const CredentialRows = Schema.Array(
  Schema.Struct({ integration_id: Schema.String, value: Schema.String }),
);

const decodeAuthFile = Schema.decodeEffect(Schema.fromJsonString(AuthFile));
const decodeRows = Schema.decodeUnknownEffect(CredentialRows);
const decodeStoredCredential = Schema.decodeUnknownOption(Schema.fromJsonString(ApiCredential));

/** Match the runtime's credential store; a 2.x login must not fall back to stale 1.x auth. */
export const readOpenCodeCredentials = Effect.fn("readOpenCodeCredentials")(function* (input: {
  readonly generation: "v1" | "v2";
  readonly environment: NodeJS.ProcessEnv;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = input.environment;
  const dataHome =
    env.XDG_DATA_HOME ||
    path.join(env.HOME || env.USERPROFILE || NodeOS.homedir(), ".local", "share");
  const root = path.join(dataHome, "opencode");
  const credentials = new Map<string, string>();
  if (env.OPENCODE_AUTH_CONTENT || input.generation === "v1") {
    const raw =
      env.OPENCODE_AUTH_CONTENT ||
      (yield* fs.readFileString(path.join(root, "auth.json")).pipe(
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound" ? Effect.succeed("{}") : Effect.fail(error),
        }),
      ));
    const auth = yield* decodeAuthFile(raw);
    for (const [id, value] of Object.entries(auth)) {
      const credential = decodeCredential(value);
      if (Option.isSome(credential) && credential.value.key.trim())
        credentials.set(id, credential.value.key.trim());
    }
  } else {
    const filename = path.join(root, "opencode.db");
    if (yield* fs.exists(filename)) {
      const rows = yield* Effect.try(() => {
        const db = new NodeSqlite.DatabaseSync(filename, { readOnly: true });
        try {
          db.exec("PRAGMA busy_timeout = 100");
          const table = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credential'")
            .get();
          return table
            ? db
                .prepare(
                  "SELECT integration_id, value FROM credential WHERE active = 1 AND integration_id IN ('opencode-go', 'zai-coding-plan') ORDER BY time_updated DESC",
                )
                .all()
            : [];
        } finally {
          db.close();
        }
      });
      const decoded = yield* decodeRows(rows);
      for (const row of decoded) {
        const value = decodeStoredCredential(row.value);
        if (!credentials.has(row.integration_id) && Option.isSome(value) && value.value.key.trim())
          credentials.set(row.integration_id, value.value.key.trim());
      }
    }
  }
  if (!credentials.has("opencode-go") && env.OPENCODE_API_KEY?.trim())
    credentials.set("opencode-go", env.OPENCODE_API_KEY.trim());
  if (!credentials.has("zai-coding-plan") && env.ZHIPU_API_KEY?.trim())
    credentials.set("zai-coding-plan", env.ZHIPU_API_KEY.trim());
  return credentials;
});
