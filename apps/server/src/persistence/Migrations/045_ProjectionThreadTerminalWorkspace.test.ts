import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

it.layer(NodeSqliteClient.layerMemory())("045_ProjectionThreadTerminalWorkspace", (it) => {
  it.effect("upgrades 044 without changing legacy rows and runs once", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 44 });
      yield* sql`INSERT INTO projection_threads (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode, created_at, updated_at) VALUES ('legacy', 'project', 'Legacy', '{"instanceId":"codex","model":"test"}', 'full-access', 'default', '2026-01-01', '2026-01-01')`;
      yield* runMigrations({ toMigrationInclusive: 45 });
      const rows = yield* sql<{
        title: string;
        terminal_workspace_json: string | null;
      }>`SELECT title, terminal_workspace_json FROM projection_threads WHERE thread_id = 'legacy'`;
      assert.deepEqual(rows, [{ title: "Legacy", terminal_workspace_json: null }]);
      const again = yield* runMigrations({ toMigrationInclusive: 45 });
      assert.equal(again.length, 0);
    }),
  );
});
