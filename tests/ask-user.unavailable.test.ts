import assert from "node:assert/strict";
import { test } from "node:test";
import { SUPPLIER_PARAMS, createHarness, startTool } from "./harness.ts";

test("14. print and json modes return unavailable and never throw", async () => {
  for (const mode of ["print", "json"]) {
    const h = createHarness({ mode, hasUI: false });
    const out = await startTool(h, SUPPLIER_PARAMS);
    assert.equal(out.structuredContent.status, "unavailable");
    assert.equal(out.structuredContent.answer, null);
  }
});

test("15. rpc mode returns unavailable in W2-0", async () => {
  const h = createHarness({ mode: "rpc", hasUI: true });
  const out = await startTool(h, SUPPLIER_PARAMS);
  assert.equal(out.structuredContent.status, "unavailable");
  assert.equal(out.structuredContent.answerKind, null);
});

test("16. no UI method is called when the mode is unavailable", async () => {
  for (const mode of ["print", "json", "rpc"]) {
    const h = createHarness({ mode, hasUI: mode === "rpc" });
    await startTool(h, SUPPLIER_PARAMS);
    assert.equal(h.customCalls, 0, `ui.custom called in ${mode} mode`);
  }
});

test("17. unavailable carries structuredContent and is marked as an error", async () => {
  const h = createHarness({ mode: "print", hasUI: false });
  const out = await startTool(h, SUPPLIER_PARAMS);
  assert.equal(out.isError, true);
  assert.ok(out.structuredContent, "structuredContent missing");
  assert.equal(out.structuredContent.status, "unavailable");
  assert.equal(out.structuredContent.question, SUPPLIER_PARAMS.question);
  assert.match(out.content[0].text, /unavailable/i);
});
