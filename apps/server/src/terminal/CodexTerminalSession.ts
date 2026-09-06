import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { TerminalAgentSession } from "@t3tools/contracts";

const RecordLine = Schema.Struct({
  timestamp: Schema.optionalKey(Schema.String),
  type: Schema.String,
  payload: Schema.Struct({
    type: Schema.optionalKey(Schema.String),
    id: Schema.optionalKey(Schema.String),
    source: Schema.optionalKey(Schema.Unknown),
    model: Schema.optionalKey(Schema.String),
    message: Schema.optionalKey(Schema.String),
    started_at: Schema.optionalKey(Schema.String),
  }),
});
const decodeLine = Schema.decodeUnknownOption(Schema.fromJsonString(RecordLine));
const SavedSession = Schema.Struct({
  path: Schema.String,
  session: TerminalAgentSession,
});
const encodeSaved = Schema.encodeEffect(Schema.fromJsonString(SavedSession));
const decodeSaved = Schema.decodeUnknownOption(Schema.fromJsonString(SavedSession));
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK_SIZE = 256 * 1024;

export function sameAgentSession(
  left: TerminalAgentSession | null | undefined,
  right: TerminalAgentSession | null | undefined,
): boolean {
  return (
    left?.provider === right?.provider &&
    left?.sessionId === right?.sessionId &&
    left?.model === right?.model &&
    left?.state === right?.state &&
    left?.title === right?.title &&
    left?.workingStartedAt === right?.workingStartedAt
  );
}

/** Only provider-authored lifecycle records change state. Output silence is not idle. */
export function reduceCodexTerminalRecord(
  session: TerminalAgentSession,
  line: string,
): TerminalAgentSession {
  const decoded = decodeLine(line);
  if (Option.isNone(decoded)) return session;
  const { type, payload, timestamp } = decoded.value;
  if (type === "turn_context" && payload.model && payload.model.length <= 256) {
    return { ...session, model: payload.model };
  }
  if (type !== "event_msg") return session;
  switch (payload.type) {
    case "user_message": {
      if (session.title || !payload.message?.trim()) return session;
      const title = payload.message.trim().replace(/\s+/g, " ").slice(0, 120);
      return { ...session, title };
    }
    case "task_started": {
      const timestampValue = payload.started_at ?? timestamp;
      const startedAt = timestampValue ? DateTime.make(timestampValue) : Option.none();
      const next = { ...session };
      delete next.workingStartedAt;
      return {
        ...next,
        state: "working",
        ...(Option.isSome(startedAt)
          ? { workingStartedAt: DateTime.formatIso(startedAt.value) }
          : {}),
      };
    }
    case "task_complete":
    case "turn_aborted":
      return { ...session, state: "idle" };
    default:
      return session;
  }
}

type Cursor = {
  path: string;
  session: TerminalAgentSession;
  offset: number;
  pending: Buffer;
  skipping: boolean;
  replayThrough: number | null;
  dirty: boolean;
};

/** Exact open-file ownership, never a search for the newest session in a shared cwd. */
export const makeCodexTerminalSessions = Effect.fn("makeCodexTerminalSessions")(function* (
  candidatesOverride?: (processIds: readonly number[]) => Effect.Effect<readonly string[]>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcessPlatform;
  const cursors = new Map<string, Cursor>();
  const candidates =
    candidatesOverride ??
    Effect.fn("codexRolloutsForProcesses")(function* (processIds: readonly number[]) {
      if (platform !== "linux") return [];
      const found = new Set<string>();
      for (const pid of processIds) {
        const directory = `/proc/${pid}/fd`;
        const entries = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
        for (const fd of entries) {
          const target = yield* fs
            .readLink(path.join(directory, fd))
            .pipe(Effect.orElseSucceed(() => ""));
          if (/\/sessions\/.*\/rollout-[^/]+\.jsonl$/.test(target)) found.add(target);
        }
      }
      return [...found];
    });
  const identify = Effect.fn("identifyCodexRollout")(function* (filePath: string) {
    const file = yield* fs.open(filePath, { flag: "r" });
    const bytes = Buffer.alloc(64 * 1024);
    const count = Number(yield* file.read(bytes));
    const end = bytes.subarray(0, count).indexOf(10);
    if (end < 0) return null;
    const record = decodeLine(bytes.subarray(0, end).toString("utf8"));
    if (Option.isNone(record)) return null;
    const { type, payload } = record.value;
    if (
      type !== "session_meta" ||
      payload.source !== "cli" ||
      !payload.id ||
      !SESSION_ID.test(payload.id)
    )
      return null;
    return {
      provider: "codex" as const,
      sessionId: payload.id,
      state: "unknown" as const,
      model: null,
    };
  }, Effect.scoped);

  const load = Effect.fn("loadCodexTerminalSession")(function* (storagePath: string) {
    const cached = cursors.get(storagePath);
    if (cached) return cached;
    const decoded = decodeSaved(
      yield* fs.readFileString(storagePath).pipe(Effect.orElseSucceed(() => "")),
    );
    if (Option.isNone(decoded)) return null;
    const cursor: Cursor = {
      ...decoded.value,
      session: { ...decoded.value.session, state: "stopped" },
      offset: 0,
      pending: Buffer.alloc(0),
      skipping: false,
      replayThrough: -1,
      dirty: false,
    };
    cursors.set(storagePath, cursor);
    return cursor;
  });
  const save = Effect.fn("saveCodexTerminalSession")(function* (
    storagePath: string,
    cursor: Cursor,
  ) {
    yield* fs.makeDirectory(path.dirname(storagePath), { recursive: true });
    const temp = `${storagePath}.tmp`;
    yield* fs.writeFileString(
      temp,
      yield* encodeSaved({ path: cursor.path, session: cursor.session }),
      { mode: 0o600 },
    );
    yield* fs.rename(temp, storagePath);
  });
  const observe = Effect.fn("observeCodexTerminalSession")(function* (
    storagePath: string,
    processIds: readonly number[],
  ) {
    const previous = yield* load(storagePath);
    const matches: Array<{ path: string; session: TerminalAgentSession }> = [];
    for (const filePath of yield* candidates(processIds)) {
      const session = yield* identify(filePath).pipe(Effect.orElseSucceed(() => null));
      if (session) matches.push({ path: filePath, session });
    }
    if (matches.length !== 1) {
      return previous
        ? {
            ...previous.session,
            state: processIds.length ? ("unknown" as const) : ("stopped" as const),
          }
        : null;
    }
    const match = matches[0]!;
    const changedIdentity =
      !previous ||
      previous.path !== match.path ||
      previous.session.sessionId !== match.session.sessionId;
    const cursor: Cursor = changedIdentity
      ? {
          ...match,
          offset: 0,
          pending: Buffer.alloc(0),
          skipping: false,
          replayThrough: null,
          dirty: true,
        }
      : previous;
    cursors.set(storagePath, cursor);
    const before = cursor.session;
    const file = yield* fs.open(cursor.path, { flag: "r" });
    const size = Number((yield* file.stat).size);
    if (cursor.replayThrough === -1) {
      cursor.replayThrough = size;
      cursor.session = { ...cursor.session, state: "unknown" };
    }
    if (size < cursor.offset) {
      cursor.offset = 0;
      cursor.pending = Buffer.alloc(0);
      cursor.skipping = false;
      cursor.session = match.session;
    }
    yield* file.seek(cursor.offset, "start");
    const bytes = Buffer.alloc(CHUNK_SIZE);
    const bytesRead = Number(yield* file.read(bytes));
    const dataStart = cursor.offset - cursor.pending.length;
    cursor.offset += bytesRead;
    const data = Buffer.concat([cursor.pending, bytes.subarray(0, bytesRead)]);
    let start = 0;
    for (let end = data.indexOf(10); end >= 0; end = data.indexOf(10, start)) {
      if (!cursor.skipping) {
        const next = reduceCodexTerminalRecord(
          cursor.session,
          data.subarray(start, end).toString("utf8"),
        );
        // Historical records recover the model, not a stale working state after restarting the host.
        cursor.session =
          cursor.replayThrough !== null && dataStart + end < cursor.replayThrough
            ? { ...next, state: "unknown" }
            : next;
      }
      cursor.skipping = false;
      start = end + 1;
    }
    cursor.pending = Buffer.from(data.subarray(start));
    if (cursor.pending.length > CHUNK_SIZE) {
      cursor.pending = Buffer.alloc(0);
      cursor.skipping = true;
    }
    if (changedIdentity || !sameAgentSession(before, cursor.session)) cursor.dirty = true;
    if (cursor.dirty) {
      yield* save(storagePath, cursor);
      cursor.dirty = false;
    }
    return cursor.offset < size ? { ...cursor.session, state: "unknown" as const } : cursor.session;
  }, Effect.scoped);
  const resume = Effect.fn("resumeCodexTerminalSession")(function* (storagePath: string) {
    const cursor = yield* load(storagePath);
    if (!cursor) return null;
    const identity = yield* identify(cursor.path).pipe(Effect.orElseSucceed(() => null));
    if (identity?.sessionId !== cursor.session.sessionId) return null;
    const sessionsIndex = cursor.path.lastIndexOf(`${path.sep}sessions${path.sep}`);
    if (sessionsIndex < 0) return null;
    cursor.replayThrough = Number((yield* fs.stat(cursor.path)).size);
    cursor.session = { ...cursor.session, state: "unknown" };
    return { session: cursor.session, home: cursor.path.slice(0, sessionsIndex) };
  });
  const forget = Effect.fn("forgetCodexTerminalSession")(function* (storagePath: string) {
    cursors.delete(storagePath);
    yield* fs.remove(storagePath, { force: true });
  });
  return { load, observe, resume, forget };
});
export type CodexTerminalSessions = Effect.Success<ReturnType<typeof makeCodexTerminalSessions>>;

export function codexResumeArgs(args: readonly string[], session: TerminalAgentSession): string[] {
  if (
    !SESSION_ID.test(session.sessionId) ||
    args.some((arg) => ["resume", "fork", "exec"].includes(arg))
  ) {
    throw new Error("This Codex command cannot be safely resumed automatically.");
  }
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-m" || arg === "--model") {
      i++;
      continue;
    }
    if (arg.startsWith("--model=")) continue;
    result.push(arg);
  }
  return [
    ...result,
    "resume",
    session.sessionId,
    ...(session.model ? ["--model", session.model] : []),
  ];
}
