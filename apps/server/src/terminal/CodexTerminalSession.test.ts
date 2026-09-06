import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import { expect } from "vite-plus/test";
import {
  makeCodexTerminalSessions,
  reduceCodexTerminalRecord,
  codexResumeArgs,
} from "./CodexTerminalSession.ts";

const id = "12345678-1234-1234-1234-123456789abc";
const native = {
  provider: "codex" as const,
  sessionId: id,
  model: null,
  state: "unknown" as const,
};
const encodeLine = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const line = (type: string, payload: Record<string, unknown>) =>
  encodeLine({ type, payload }) + "\n";
const meta = (sessionId = id) =>
  line("session_meta", { id: sessionId, source: "cli", cwd: "/same-project" });
const event = (type: string) => line("event_msg", { type });
const fixture = Effect.fn("fixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const base = yield* fs.makeTempDirectoryScoped({ prefix: "t3-native-session-" });
  const home = path.join(base, "home");
  const directory = path.join(home, "sessions", "2026", "09", "06");
  yield* fs.makeDirectory(directory, { recursive: true });
  const rollout = path.join(directory, `rollout-${id}.jsonl`);
  const storage = path.join(base, "association.json");
  return { fs, path, base, home, rollout, storage };
});
it.layer(NodeServices.layer)("Codex terminal session observation", (it) => {
  it.effect("reads the exact file held open by a process on Linux", () =>
    Effect.gen(function* () {
      if ((yield* HostProcessPlatform) !== "linux") return;
      const { fs, rollout, storage } = yield* fixture();
      yield* fs.writeFileString(rollout, meta() + event("task_started"));
      yield* fs.open(rollout, { flag: "r" });
      const tracker = yield* makeCodexTerminalSessions();
      expect(yield* tracker.observe(storage, [process.pid])).toMatchObject({
        sessionId: id,
        state: "working",
      });
    }),
  );
  it.effect("keeps simultaneous CLI sessions in the same cwd separate and rejects ambiguity", () =>
    Effect.gen(function* () {
      const { fs, path, base, rollout, storage } = yield* fixture();
      const second = path.join(path.dirname(rollout), "rollout-second.jsonl");
      const otherId = "87654321-1234-1234-1234-123456789abc";
      yield* fs.writeFileString(rollout, meta() + event("task_started"));
      yield* fs.writeFileString(second, meta(otherId) + event("task_complete"));
      const tracker = yield* makeCodexTerminalSessions((pids) =>
        Effect.succeed(pids.flatMap((pid) => (pid === 1 ? [rollout] : [second]))),
      );
      expect(yield* tracker.observe(storage, [1])).toMatchObject({
        sessionId: id,
        state: "working",
      });
      expect(yield* tracker.observe(path.join(base, "second.json"), [2])).toMatchObject({
        sessionId: otherId,
        state: "idle",
      });
      expect(yield* tracker.observe(storage, [1, 2])).toMatchObject({
        sessionId: id,
        state: "unknown",
      });
      expect(yield* tracker.observe(path.join(base, "ambiguous.json"), [1, 2])).toBeNull();
    }),
  );
  it.effect(
    "handles partial records, model changes, silence, stop and interruption incrementally",
    () =>
      Effect.gen(function* () {
        const { fs, rollout, storage } = yield* fixture();
        yield* fs.writeFileString(
          rollout,
          meta() + event("task_started") + '{"type":"turn_context","payload":{"model":"gpt-5.6-',
        );
        const tracker = yield* makeCodexTerminalSessions(() => Effect.succeed([rollout]));
        expect(yield* tracker.observe(storage, [1])).toMatchObject({
          state: "working",
          model: null,
        });
        expect(yield* tracker.observe(storage, [1])).toMatchObject({ state: "working" });
        yield* fs.writeFileString(rollout, 'luna"}}\n' + event("turn_aborted"), { flag: "a" });
        expect(yield* tracker.observe(storage, [1])).toMatchObject({
          state: "idle",
          model: "gpt-5.6-luna",
        });
        yield* fs.writeFileString(
          rollout,
          line("turn_context", { model: "another-model" }) + event("task_started"),
          { flag: "a" },
        );
        expect(yield* tracker.observe(storage, [1])).toMatchObject({
          state: "working",
          model: "another-model",
        });
        expect(reduceCodexTerminalRecord(native, event("unknown_future_event"))).toEqual(native);
      }),
  );
  it.effect(
    "persists identity and model, validates resume, and does not replay stale working after restart",
    () =>
      Effect.gen(function* () {
        const { fs, rollout, storage, home } = yield* fixture();
        yield* fs.writeFileString(
          rollout,
          meta() + line("turn_context", { model: "gpt-5.6-luna" }) + event("task_started"),
        );
        const tracker = yield* makeCodexTerminalSessions(() => Effect.succeed([rollout]));
        yield* tracker.observe(storage, [1]);
        const restored = yield* makeCodexTerminalSessions(() => Effect.succeed([rollout]));
        expect(yield* restored.resume(storage)).toMatchObject({
          home,
          session: { sessionId: id, model: "gpt-5.6-luna", state: "unknown" },
        });
        expect(yield* restored.observe(storage, [1])).toMatchObject({
          state: "unknown",
          model: "gpt-5.6-luna",
        });
        yield* fs.writeFileString(rollout, event("task_started"), { flag: "a" });
        expect(yield* restored.observe(storage, [1])).toMatchObject({ state: "working" });
        yield* fs.remove(rollout);
        expect(yield* restored.resume(storage)).toBeNull();
      }),
  );
  it.effect("rejects subagent logs and persists new identities even before a first turn", () =>
    Effect.gen(function* () {
      const { fs, rollout, storage } = yield* fixture();
      yield* fs.writeFileString(rollout, line("session_meta", { id, source: { subagent: {} } }));
      const tracker = yield* makeCodexTerminalSessions(() => Effect.succeed([rollout]));
      expect(yield* tracker.observe(storage, [1])).toBeNull();
      yield* fs.writeFileString(rollout, meta());
      expect(yield* tracker.observe(storage, [1])).toMatchObject({
        state: "unknown",
        sessionId: id,
      });
      const restored = yield* makeCodexTerminalSessions();
      expect(yield* restored.resume(storage)).not.toBeNull();
    }),
  );
  it.effect("resumes an exact ID with the observed model and refuses nested resume commands", () =>
    Effect.sync(() => {
      expect(
        codexResumeArgs(["--model", "old-model", "--profile", "work"], {
          ...native,
          model: "gpt-5.6-luna",
        }),
      ).toEqual(["--profile", "work", "resume", id, "--model", "gpt-5.6-luna"]);
      expect(() => codexResumeArgs(["resume", "--last"], native)).toThrow();
      expect(() => codexResumeArgs([], { ...native, sessionId: "--last" })).toThrow();
    }),
  );
});
