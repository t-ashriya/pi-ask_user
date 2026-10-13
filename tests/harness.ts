/**
 * W2-1 test harness.
 *
 * Drives the real `ask_user` tool through a fake ExtensionContext/UI. The tool
 * is expected to expose:
 *   - `askUserTool` from `src/ask-user.ts` (ToolDefinition with `execute`)
 *   - `AskUserParams` from `src/ask-user.ts` (TypeBox schema)
 *
 * The implementation does not exist yet; these tests fail until W2-2.
 */

import { askUserTool } from "../src/ask-user.ts";

export const KEY = {
  up: "\x1b[A",
  down: "\x1b[B",
  enter: "\r",
  escape: "\x1b",
} as const;

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const fakeTui = {
  requestRender() {},
  terminal: { rows: 24, columns: 80 },
};

export interface UiHarness {
  ctx: any;
  mode: string;
  customCalls: number;
  component: any;
  finish: (value: any) => void;
}

/** Create a fake ctx whose `ui.custom` captures the component for driving. */
export function createHarness(options: { mode?: string; hasUI?: boolean } = {}): UiHarness {
  const mode = options.mode ?? "tui";
  const hasUI = options.hasUI ?? mode === "tui";
  const harness: UiHarness = {
    mode,
    customCalls: 0,
    component: undefined,
    finish: () => {},
    ctx: undefined,
  };

  const forbidden = (name: string) => () => {
    throw new Error(`ui.${name} must not be called when the UI is unavailable`);
  };

  const ui = {
    custom(factory: any) {
      harness.customCalls += 1;
      return new Promise((resolve) => {
        harness.finish = resolve;
        harness.component = factory(fakeTui, fakeTheme, {}, resolve);
      });
    },
    notify: forbidden("notify"),
    select: forbidden("select"),
    confirm: forbidden("confirm"),
    input: forbidden("input"),
    editor: forbidden("editor"),
  };

  harness.ctx = { mode, hasUI, cwd: process.cwd(), ui, signal: undefined };
  return harness;
}

/** Start the tool call. Await `tick()` before driving the captured component. */
export function startTool(harness: UiHarness, params: unknown): Promise<any> {
  return askUserTool.execute("test-call", params as any, undefined, undefined, harness.ctx);
}

export function tick(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

export function press(component: any, key: string): void {
  component.handleInput(key);
}

export function typeText(component: any, text: string): void {
  for (const ch of text) component.handleInput(ch);
}

export function renderText(component: any, width = 80): string {
  return component.render(width).join("\n");
}

/** Resolve to the promise value, or "pending" if it does not settle in time. */
export function settle<T>(promise: Promise<T>, ms = 300): Promise<T | "pending"> {
  return Promise.race([
    promise,
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms)),
  ]);
}

export const SUPPLIER_PARAMS = {
  question: "Which supplier should we reorder the low-stock eggs from?",
  reason: "Cost vs. availability materially affects the order and is hard to reverse.",
  options: [
    { label: "Supplier A (cheap, 5-day)", description: "8% lower cost, arrives after stock-out." },
    { label: "Supplier B (next-day)", description: "15% higher cost, restocks before stock-out." },
    { label: "Supplier C (local)", description: "Fastest, but limited stock and highest cost." },
  ],
};

export const LABELS = SUPPLIER_PARAMS.options.map((o) => o.label);
