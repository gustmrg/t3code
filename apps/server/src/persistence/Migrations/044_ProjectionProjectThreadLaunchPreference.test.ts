import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_ProjectionProjectThreadLaunchPreference", (it) => {
  it.effect("adds the nullable project launch preference", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* runMigrations({ toMigrationInclusive: 44 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_projects)
      `;
      const preference = columns.find((column) => column.name === "thread_launch_preference_json");

      assert.equal(preference?.name, "thread_launch_preference_json");
      assert.equal(preference?.notnull, 0);
    }),
  );
});
