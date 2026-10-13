import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KEY,
  LABELS,
  SUPPLIER_PARAMS,
  createHarness,
  press,
  renderText,
  settle,
  startTool,
  tick,
  typeText,
} from "./harness.ts";

function moveTo(component: any, index: number): void {
  for (let i = 0; i < index; i++) press(component, KEY.down);
}

test("1. selecting the first option returns the exact label and 1-based index", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.status, "answered");
  assert.equal(out.structuredContent.answer, LABELS[0]);
  assert.equal(out.structuredContent.answerKind, "option");
  assert.equal(out.structuredContent.selectedIndex, 1);
  assert.match(out.content[0].text, /Supplier A/);
});

test("2. selecting the last option returns the correct 1-based index", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length - 1);
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.status, "answered");
  assert.equal(out.structuredContent.answer, LABELS[LABELS.length - 1]);
  assert.equal(out.structuredContent.selectedIndex, LABELS.length);
});

test("3. up/down navigation clamps at the ends and does not wrap", async () => {
  const top = createHarness();
  const topResult = startTool(top, SUPPLIER_PARAMS);
  await tick();
  for (let i = 0; i < 5; i++) press(top.component, KEY.up);
  press(top.component, KEY.enter);
  const topOut = await topResult;
  assert.equal(topOut.structuredContent.answer, LABELS[0]);

  const bottom = createHarness();
  const bottomResult = startTool(bottom, SUPPLIER_PARAMS);
  await tick();
  for (let i = 0; i < 10; i++) press(bottom.component, KEY.down);
  press(bottom.component, KEY.up);
  press(bottom.component, KEY.enter);
  const bottomOut = await bottomResult;
  assert.equal(bottomOut.structuredContent.answer, LABELS[LABELS.length - 1]);
});

test("4. options render with their tradeoff descriptions", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  const rendered = renderText(h.component);
  for (const option of SUPPLIER_PARAMS.options) {
    assert.ok(rendered.includes(option.label), `missing label: ${option.label}`);
    assert.ok(rendered.includes(option.description), `missing description: ${option.description}`);
  }
  press(h.component, KEY.enter);
  await result;
});

test("5. typing a custom answer returns answerKind custom and null index", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  typeText(h.component, "Split the order");
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.status, "answered");
  assert.equal(out.structuredContent.answer, "Split the order");
  assert.equal(out.structuredContent.answerKind, "custom");
  assert.equal(out.structuredContent.selectedIndex, null);
  assert.match(out.content[0].text, /Split the order/);
});

test("6. custom answer preserves exact casing, spacing, and punctuation", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  const exact = "Order 3 cases from B, hold A!";
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  typeText(h.component, exact);
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.answer, exact);
  assert.equal(out.structuredContent.answerKind, "custom");
});

test("7. custom text matching an option label is still treated as custom", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  typeText(h.component, LABELS[0]);
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.answer, LABELS[0]);
  assert.equal(out.structuredContent.answerKind, "custom");
  assert.equal(out.structuredContent.selectedIndex, null);
});

test("8. escape on the option list cancels with no answer", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  press(h.component, KEY.escape);

  const out = await result;
  assert.equal(out.structuredContent.status, "cancelled");
  assert.equal(out.structuredContent.answer, null);
  assert.equal(out.structuredContent.answerKind, null);
  assert.equal(out.structuredContent.selectedIndex, null);
  assert.match(out.content[0].text, /cancel/i);
});

test("9. escape inside the editor returns to the list without cancelling", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  typeText(h.component, "half-typed");
  press(h.component, KEY.escape);
  press(h.component, KEY.up);
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.status, "answered");
  assert.equal(out.structuredContent.answerKind, "option");
  assert.equal(out.structuredContent.answer, LABELS[LABELS.length - 1]);
});

test("10. cancelling after typing discards the typed text", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  typeText(h.component, "discard me");
  press(h.component, KEY.escape);
  press(h.component, KEY.up);
  press(h.component, KEY.enter);

  const out = await result;
  assert.equal(out.structuredContent.answer, LABELS[LABELS.length - 1]);
  assert.notEqual(out.structuredContent.answer, "discard me");
});

test("11. submitting an empty custom answer does not resolve the prompt", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  press(h.component, KEY.enter);

  assert.equal(await settle(result), "pending");

  typeText(h.component, "valid answer");
  press(h.component, KEY.enter);
  typeText(h.component, "valid answer");
  press(h.component, KEY.enter);

  const out = await settle(result, 1000);
  assert.notEqual(out, "pending");
  assert.equal((out as any).structuredContent.answer, "valid answer");
});

test("12. submitting a whitespace-only answer does not resolve the prompt", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  typeText(h.component, "   ");
  press(h.component, KEY.enter);

  assert.equal(await settle(result), "pending");

  press(h.component, KEY.escape);
  press(h.component, KEY.escape);
  const out = await settle(result, 1000);
  assert.notEqual(out, "pending");
  assert.equal((out as any).structuredContent.status, "cancelled");
});

test("13. after a rejected empty submission a valid answer still terminates the call", async () => {
  const h = createHarness();
  const result = startTool(h, SUPPLIER_PARAMS);
  await tick();
  moveTo(h.component, LABELS.length);
  press(h.component, KEY.enter);
  press(h.component, KEY.enter);
  assert.equal(await settle(result), "pending");

  typeText(h.component, "answer after empty");
  press(h.component, KEY.enter);
  typeText(h.component, "answer after empty");
  press(h.component, KEY.enter);

  const out = await settle(result, 1000);
  assert.notEqual(out, "pending");
  assert.equal((out as any).structuredContent.answer, "answer after empty");
});
