import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const UPDATED_AT = "2026-01-01T00:00:00.000Z";

const readModel: OrchestrationReadModel = {
  snapshotSequence: 0,
  projects: [],
  threads: [
    {
      id: ThreadId.make("thread-1"),
      projectId: ProjectId.make("project-1"),
      title: "Manual title",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
  updatedAt: UPDATED_AT,
};

import { projectEvent } from "./projector.ts";
import { EventId, type OrchestrationEvent, type OrchestrationCommand } from "@t3tools/contracts";
const binding = { mainTerminalId: "term-7", startup: { _tag: "shell" as const } };
const threadId = ThreadId.make("thread-1");
const commandId = CommandId.make("binding");
it.layer(NodeServices.layer)("terminal workspace binding", (it) => {
  it.effect(
    "converts explicitly, replays and preserves binding during ordinary metadata updates",
    () =>
      Effect.gen(function* () {
        const decided = yield* decideOrchestrationCommand({
          readModel,
          command: { type: "thread.meta.update", commandId, threadId, terminalWorkspace: binding },
        });
        const event = (Array.isArray(decided) ? decided[0] : decided) as OrchestrationEvent;
        const bound = yield* projectEvent(readModel, {
          ...event,
          sequence: 1,
          eventId: EventId.make("bound"),
        });
        expect(bound.threads[0]?.terminalWorkspace).toEqual(binding);
        const renamed = yield* decideOrchestrationCommand({
          readModel: bound,
          command: {
            type: "thread.meta.update",
            commandId,
            threadId,
            title: "Renamed",
            branch: "main",
          },
        });
        const renameEvent = (Array.isArray(renamed) ? renamed[0] : renamed) as OrchestrationEvent;
        const replayed = yield* projectEvent(bound, {
          ...renameEvent,
          sequence: 2,
          eventId: EventId.make("renamed"),
        });
        expect(replayed.threads[0]?.terminalWorkspace).toEqual(binding);
        for (const terminalWorkspace of [null, { ...binding, mainTerminalId: "other" }]) {
          const result = yield* Effect.result(
            decideOrchestrationCommand({
              readModel: bound,
              command: { type: "thread.meta.update", commandId, threadId, terminalWorkspace },
            }),
          );
          expect(result._tag).toBe("Failure");
        }
        const turn = yield* Effect.result(
          decideOrchestrationCommand({
            readModel: bound,
            command: { type: "thread.turn.start", commandId, threadId } as OrchestrationCommand,
          }),
        );
        expect(turn._tag).toBe("Failure");
        if (turn._tag === "Failure")
          expect(turn.failure.message).toContain("Chat for terminal workspace");
      }),
  );
  it.effect("rejects conversion with structured session or history", () =>
    Effect.gen(function* () {
      for (const thread of [
        { ...readModel.threads[0]!, session: { status: "ready" } },
        { ...readModel.threads[0]!, messages: [{ role: "user", text: "existing" }] },
      ]) {
        const result = yield* Effect.result(
          decideOrchestrationCommand({
            readModel: { ...readModel, threads: [thread] } as unknown as OrchestrationReadModel,
            command: {
              type: "thread.meta.update",
              commandId,
              threadId,
              terminalWorkspace: binding,
            },
          }),
        );
        expect(result._tag).toBe("Failure");
      }
    }),
  );
});

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { OrchestrationProjectionPipelineLive } from "./Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionPipeline } from "./Services/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./Layers/ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { OrchestrationEventStoreLive } from "../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationEventStore } from "../persistence/Services/OrchestrationEventStore.ts";
import { ProjectionThreadRepositoryLive } from "../persistence/Layers/ProjectionThreads.ts";
import { ProjectionThreadRepository } from "../persistence/Services/ProjectionThreads.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ServerConfig } from "../config.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import * as ThreadBackgroundLiveness from "./ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "./ThreadPlanProgress.ts";

const projectionLayer = Layer.mergeAll(
  OrchestrationProjectionPipelineLive,
  ProjectionThreadRepositoryLive,
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(RepositoryIdentityResolver.layer),
  ),
).pipe(
  Layer.provideMerge(OrchestrationEventStoreLive),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "terminal-workspace-test-" })),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);
it.layer(projectionLayer)("terminal workspace persistence", (it) => {
  it.effect(
    "round trips create, incremental metadata, repository lists, full and shell snapshots and replay",
    () =>
      Effect.gen(function* () {
        const events = yield* OrchestrationEventStore;
        const pipeline = yield* OrchestrationProjectionPipeline;
        const query = yield* ProjectionSnapshotQuery;
        const repository = yield* ProjectionThreadRepository;
        const projectId = ProjectId.make("project-1");
        const base = {
          occurredAt: UPDATED_AT,
          commandId,
          causationEventId: null,
          correlationId: null,
          metadata: {},
        };
        yield* events.append({
          ...base,
          eventId: EventId.make("project"),
          aggregateKind: "project",
          aggregateId: projectId,
          type: "project.created",
          payload: {
            projectId,
            title: "Project",
            workspaceRoot: "/tmp/project",
            defaultModelSelection: null,
            scripts: [],
            createdAt: UPDATED_AT,
            updatedAt: UPDATED_AT,
          },
        });
        yield* events.append({
          ...base,
          eventId: EventId.make("created"),
          aggregateKind: "thread",
          aggregateId: threadId,
          type: "thread.created",
          payload: { ...readModel.threads[0]!, threadId, terminalWorkspace: binding },
        });
        yield* pipeline.bootstrap;
        const renamed = yield* events.append({
          ...base,
          eventId: EventId.make("updated"),
          aggregateKind: "thread",
          aggregateId: threadId,
          type: "thread.meta-updated",
          payload: { threadId, title: "Renamed", branch: "main", updatedAt: UPDATED_AT },
        });
        yield* pipeline.projectEvent(renamed);
        const detail = Option.getOrThrow(yield* query.getThreadDetailById(threadId));
        const shell = Option.getOrThrow(yield* query.getThreadShellById(threadId));
        const page = Option.getOrThrow(
          yield* query.getThreadDetailSnapshot(threadId, { turnLimit: 10 }),
        );
        expect(detail.terminalWorkspace).toEqual(binding);
        expect(shell.terminalWorkspace).toEqual(binding);
        expect(page.thread.terminalWorkspace).toEqual(binding);
        expect((yield* query.getSnapshot()).threads[0]?.terminalWorkspace).toEqual(binding);
        expect((yield* query.getShellSnapshot()).threads[0]?.terminalWorkspace).toEqual(binding);
        expect(
          Option.getOrThrow(yield* repository.getById({ threadId })).terminalWorkspace,
        ).toEqual(binding);
        expect((yield* repository.listByProjectId({ projectId }))[0]?.terminalWorkspace).toEqual(
          binding,
        );
        yield* pipeline.bootstrap;
        expect(
          Option.getOrThrow(yield* query.getThreadShellById(threadId)).terminalWorkspace,
        ).toEqual(binding);
      }),
  );
});
