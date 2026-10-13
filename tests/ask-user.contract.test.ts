import assert from "node:assert/strict";
import { test } from "node:test";
import { Check } from "typebox/value";
import { AskUserParams } from "../src/ask-user.ts";
import { KEY, LABELS, SUPPLIER_PARAMS, createHarness, press, startTool, tick } from "./harness.ts";

const BASE = {
  question: "Q",
  reason: "R",
  options: [{ label: "A" }, { label: "B" }],
};

test("18. option count is validated to 2-3 and question/reason must be non-empty", () => {
  assert.equal(Check(AskUserParams, BASE), true);
  assert.equal(Check(AskUserParams, { ...BASE, options: [{ label: "A" }] }), false);
  assert.equal(
    Check(AskUserParams, {
      ...BASE,
      options: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
    }),
    false,
  );
  assert.equal(Check(AskUserParams, { ...BASE, question: "" }), false);
  assert.equal(Check(AskUserParams, { ...BASE, reason: "" }), false);
});

test("19. bad recommendations, duplicate labels, and whitespace-only text are argument errors", async () => {
  const h = createHarness();
  await assert.rejects(
    startTool(h, { ...BASE, recommendation: { option: "Z" } }),
    /recommendation|option|label/i,
  );

  const dup = createHarness();
  await assert.rejects(
    startTool(dup, { ...BASE, options: [{ label: "A" }, { label: "A" }] }),
    /duplicate|unique|label/i,
  );

  const blank = createHarness();
  await assert.rejects(
    startTool(blank, { ...BASE, question: "   " }),
    /question|empty|whitespace/i,
  );
});

test("20. answered and cancelled results are not marked as errors", async () => {
  const answered = createHarness();
  const answeredResult = startTool(answered, SUPPLIER_PARAMS);
  await tick();
  press(answered.component, KEY.enter);
  const answeredOut = await answeredResult;
  assert.equal(answeredOut.isError ?? false, false);
  assert.equal(answeredOut.structuredContent.status, "answered");

  const cancelled = createHarness();
  const cancelledResult = startTool(cancelled, SUPPLIER_PARAMS);
  await tick();
  press(cancelled.component, KEY.escape);
  const cancelledOut = await cancelledResult;
  assert.equal(cancelledOut.isError ?? false, false);
  assert.equal(cancelledOut.structuredContent.status, "cancelled");
});

test("21. details and structuredContent agree with the model-facing content", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  press(h.component, KEY.enter);
  const out = await result;

  assert.deepEqual(out.structuredContent, out.details);
  assert.equal(out.structuredContent.status, out.details.status);
  assert.equal(out.structuredContent.answer, LABELS[0]);
  assert.equal(out.structuredContent.selectedIndex, out.details.selectedIndex);
  assert.match(out.content[0].text, new RegExp(LABELS[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
