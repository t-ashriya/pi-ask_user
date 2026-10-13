import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

test("22. the extension registers ask_user with Pi's loader", async () => {
  const emptyAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ask-user-agent-"));
  try {
    const loaded = await discoverAndLoadExtensions(["./src/ask-user.ts"], process.cwd(), emptyAgentDir);
    assert.deepEqual(loaded.errors, []);
    const tool = loaded.extensions.flatMap((e) => [...e.tools.values()]).find((t) => t.definition.name === "ask_user");
    assert.ok(tool, "ask_user was not registered");
    assert.equal(tool.definition.label, "Ask User");
    assert.equal(tool.definition.executionMode, "sequential");
    assert.ok(tool.definition.parameters, "parameters schema missing");
    assert.ok(tool.definition.outputSchema, "outputSchema missing");
  } finally {
    fs.rmSync(emptyAgentDir, { recursive: true, force: true });
  }
});
