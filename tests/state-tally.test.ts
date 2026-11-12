// What `status` and /v1/state add up over all runs. Failure case: every call parses the JSON of every run ever kept, so with
// thousands of runs the hub's one thread spends its time on it and workers and channels time out.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { COUNTS, SPENDING, viewStatements } from "../host/state.ts";
import { initialize } from "../kernel/evolve.ts";

const plan = (db: DatabaseSync, sql: string) =>
  db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all("2026-11-12T00:00:00.000Z")
    .map((row) => String(row.detail));

test("the totals are read from an index, not from every run's JSON", () => {
  const db = new DatabaseSync(":memory:");
  initialize(db);
  db.exec(viewStatements.join(";"));
  const counts = plan(db, COUNTS);
  assert.ok(!counts.some((step) => step.includes("TEMP B-TREE")), counts.join(" | "));
  assert.ok(
    counts.some((step) => /USING (COVERING )?INDEX projection_runs_/.test(step)),
    counts.join(" | "),
  );
  const spending = plan(db, SPENDING);
  assert.ok(
    spending.some((step) => step.includes("COVERING INDEX projection_runs_")),
    spending.join(" | "),
  );
});
