// A rule with a higher priority is claimed before work queued earlier for rules with a lower one; within the same
// priority, work goes in the order it was queued. Failure cases: earlier low-priority work goes first; priority lets a
// rule run past its group's parallel or a subject that already has a run going; a priority that isn't a positive whole
// number gets in.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { at, setup } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "agent-autoloop-priority-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const rulesFile = join(dir, "rules.json");
const rules = (priority: unknown) => ({
  sources: { app: { name: "应用" } },
  agents: { a1: { name: "甲", worker: "w1", use: "claude" } },
  channels: {},
  rules: [
    { name: "开发", when: { source: "app", types: ["dev"] }, to: "a1", cwd: "~/code/app", prompt: "开发", parallel: 2 },
    {
      name: "打回",
      when: { source: "app", types: ["revise"] },
      to: "a1",
      cwd: "~/code/app",
      prompt: "改",
      parallel: 2,
      priority,
    },
  ],
});
writeFileSync(rulesFile, JSON.stringify(rules(10)));
setup("priority", rulesFile);

const { ingest, claimNext } = await import("./hub.ts");
const { parseRules } = await import("../protocol/rules.ts");
const claim = () => claimNext("w1", `c${Math.random()}`, at(10));
const event = (type: string, subject: string) => ({ id: `${type}:${subject}`, type, subject });

test("higher priority goes first, then the order things were queued, still within each group's parallel", () => {
  ingest("app", event("dev", "a"), at(0));
  ingest("app", event("dev", "b"), at(1));
  ingest("app", event("dev", "c"), at(2));
  ingest("app", event("revise", "x"), at(3));
  ingest("app", event("revise", "x2"), at(4));
  ingest("app", event("revise", "y"), at(5));
  const order = [claim(), claim(), claim(), claim(), claim()].map((job) => job && job.context.events[0].subject);
  assert.deepEqual(order, ["x", "x2", "a", "b", null]);
});

test("a priority has to be a positive whole number", () => {
  for (const bad of [0, -1, 1.5, "高"]) {
    assert.throws(() => parseRules(JSON.stringify(rules(bad)), at(0), "Asia/Shanghai"), /priority/);
  }
  assert.doesNotThrow(() => parseRules(JSON.stringify(rules(3)), at(0), "Asia/Shanghai"));
});
