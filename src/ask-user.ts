/**
 * ask_user — a model-callable tool that pauses for a human decision.
 *
 * W2-2 implementation of the W2-0 contract (ASK_USER_PLAN.md).
 * TUI only in this milestone; RPC/JSON/print report `unavailable`.
 */

import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const Option = Type.Object({
	label: Type.String({
		description: "Short display label for the option (the exact value returned if chosen).",
	}),
	description: Type.Optional(
		Type.String({
			description: "The tradeoff: cost, delivery time, risk, effort, or consequence.",
		}),
	),
});

const Recommendation = Type.Object({
	option: Type.String({
		description: "Label of the recommended option; must match one of options[].label.",
	}),
	rationale: Type.Optional(
		Type.String({
			description: "One-line reason for the recommendation.",
		}),
	),
});

export const AskUserParams = Type.Object({
	question: Type.String({
		minLength: 1,
		description: "A single, specific question. No compound or leading questions.",
	}),
	reason: Type.String({
		minLength: 1,
		description: "Brief reason the decision cannot be inferred and materially affects the task.",
	}),
	options: Type.Array(Option, {
		minItems: 2,
		maxItems: 3,
		description: "Two or three mutually exclusive options, each with its tradeoff.",
	}),
	recommendation: Type.Optional(Recommendation),
});

export type AskUserStatus = "answered" | "cancelled" | "unavailable";

export type AskUserStructured = {
	status: AskUserStatus;
	question: string;
	options: string[];
	answer: string | null;
	answerKind: "option" | "custom" | null;
	selectedIndex: number | null;
	recommendation: string | null;
	message: string;
};

export const AskUserStructuredSchema = Type.Object({
	status: Type.Union([Type.Literal("answered"), Type.Literal("cancelled"), Type.Literal("unavailable")]),
	question: Type.String(),
	options: Type.Array(Type.String()),
	answer: Type.Union([Type.String(), Type.Null()]),
	answerKind: Type.Union([Type.Literal("option"), Type.Literal("custom"), Type.Null()]),
	selectedIndex: Type.Union([Type.Number(), Type.Null()]),
	recommendation: Type.Union([Type.String(), Type.Null()]),
	message: Type.String(),
});

type AskUserParamsType = {
	question: string;
	reason: string;
	options: { label: string; description?: string }[];
	recommendation?: { option: string; rationale?: string };
};

type UiResult = { kind: "option"; label: string; index: number } | { kind: "custom"; text: string } | null;

const CUSTOM_LABEL = "Type something…";

function fail(message: string): never {
	throw new Error(message);
}

/** Semantic argument validation beyond the TypeBox schema. */
function validateParams(params: AskUserParamsType): void {
	if (!params.question.trim()) fail("question must not be empty or whitespace");
	if (!params.reason.trim()) fail("reason must not be empty or whitespace");

	const labels = params.options.map((o) => o.label);
	const seen = new Set<string>();
	for (const label of labels) {
		if (seen.has(label)) fail(`duplicate option label: "${label}"`);
		seen.add(label);
	}

	if (params.recommendation && !labels.includes(params.recommendation.option)) {
		fail(`recommendation.option "${params.recommendation.option}" is not one of the option labels`);
	}
}

function buildResult(
	params: AskUserParamsType,
	status: AskUserStatus,
	answer: string | null,
	answerKind: "option" | "custom" | null,
	selectedIndex: number | null,
): AskUserStructured {
	const options = params.options.map((o) => o.label);
	const recommendation = params.recommendation?.option ?? null;

	let message: string;
	if (status === "answered" && answerKind === "option") {
		message = `User selected option ${selectedIndex}: "${answer}".`;
	} else if (status === "answered") {
		message = `User answered: "${answer}".`;
	} else if (status === "cancelled") {
		message = "User cancelled the question; no answer was provided.";
	} else {
		message = "ask_user is unavailable; no answer was provided.";
	}

	return { status, question: params.question, options, answer, answerKind, selectedIndex, recommendation, message };
}

function toolResult(
	structured: AskUserStructured,
	options: { isError?: boolean } = {},
): { content: { type: "text"; text: string }[]; details: AskUserStructured; structuredContent: AskUserStructured; isError?: boolean } {
	return {
		content: [{ type: "text", text: structured.message }],
		details: structured,
		structuredContent: structured,
		...(options.isError ? { isError: true } : {}),
	};
}

export const askUserTool: ToolDefinition<typeof AskUserParams, AskUserStructured> = {
	name: "ask_user",
	label: "Ask User",
	description:
		"Ask the human a single decision that cannot be safely inferred. Use only when the choice is material, " +
		"unresolved, hard to reverse, and has 2-3 genuine options with different tradeoffs. Do not use it to confirm " +
		"defaults, look up facts, or report progress.",
	promptSnippet: "Ask the human one material decision with 2-3 options.",
	promptGuidelines: [
		"Use ask_user only when the decision is unresolved, material, and hard or costly to reverse, and there are 2-3 genuine options with different tradeoffs. Include a recommendation when one option is clearly better.",
		"Proceed without asking when requirements are already clear, a safe reversible default exists, the answer can be found by inspecting files or data, or the user already answered the same decision.",
		"Never use ask_user to confirm obvious defaults, look up facts, report progress, or bundle several decisions into one call.",
	],
	parameters: AskUserParams,
	outputSchema: AskUserStructuredSchema,
	executionMode: "sequential",

	async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionToolContext) {
		validateParams(params);

		if (ctx.mode !== "tui") {
			const structured = buildResult(params, "unavailable", null, null, null);
			structured.message = `ask_user is unavailable (${ctx.mode} mode); no answer was provided.`;
			return toolResult(structured, { isError: true });
		}

		const allOptions: { label: string; description?: string; isCustom?: boolean }[] = [
			...params.options,
			{ label: CUSTOM_LABEL, isCustom: true },
		];

		const uiResult = await ctx.ui.custom<UiResult>((tui, theme, _kb, done) => {
			let selectedIndex = 0;
			let editMode = false;
			let cachedLines: string[] | undefined;

			const editorTheme: EditorTheme = {
				borderColor: (s) => theme.fg("accent", s),
				selectList: {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				},
			};
			const editor = new Editor(tui, editorTheme);

			function refresh() {
				cachedLines = undefined;
				tui.requestRender();
			}

			editor.onSubmit = (value) => {
				if (value.trim()) {
					done({ kind: "custom", text: value });
				} else {
					editMode = false;
					editor.setText("");
					refresh();
				}
			};

			function handleInput(data: string) {
				if (editMode) {
					if (matchesKey(data, Key.escape)) {
						editMode = false;
						editor.setText("");
						refresh();
						return;
					}
					editor.handleInput(data);
					refresh();
					return;
				}

				if (matchesKey(data, Key.up)) {
					selectedIndex = Math.max(0, selectedIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down)) {
					selectedIndex = Math.min(allOptions.length - 1, selectedIndex + 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					const selected = allOptions[selectedIndex];
					if (selected.isCustom) {
						editMode = true;
						refresh();
					} else {
						done({ kind: "option", label: selected.label, index: selectedIndex + 1 });
					}
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}

			function render(width: number): string[] {
				if (cachedLines) return cachedLines;
				const renderWidth = Math.max(1, width);
				const lines: string[] = [];

				lines.push(theme.fg("accent", "─".repeat(renderWidth)));
				lines.push(theme.fg("text", params.question));
				if (params.recommendation) {
					const rationale = params.recommendation.rationale ? ` — ${params.recommendation.rationale}` : "";
					lines.push(theme.fg("success", `Recommended: ${params.recommendation.option}${rationale}`));
				}
				lines.push("");

				for (let i = 0; i < allOptions.length; i++) {
					const opt = allOptions[i];
					const selected = i === selectedIndex;
					const prefix = selected ? "> " : "  ";
					const label = `${i + 1}. ${opt.label}${opt.isCustom && editMode ? " ✎" : ""}`;
					lines.push(theme.fg(selected || (opt.isCustom && editMode) ? "accent" : "text", prefix + label));
					if (opt.description) {
						lines.push("     " + theme.fg("muted", opt.description));
					}
				}

				if (editMode) {
					lines.push("");
					lines.push(theme.fg("muted", "Your answer:"));
					for (const line of editor.render(Math.max(1, renderWidth - 2))) {
						lines.push(" " + line);
					}
				}

				lines.push("");
				lines.push(
					theme.fg("dim", editMode ? "Enter to submit • Esc to go back" : "↑↓ navigate • Enter to select • Esc to cancel"),
				);
				lines.push(theme.fg("accent", "─".repeat(renderWidth)));

				cachedLines = lines;
				return lines;
			}

			return {
				render,
				invalidate: () => {
					cachedLines = undefined;
				},
				handleInput,
			};
		});

		if (!uiResult) {
			return toolResult(buildResult(params, "cancelled", null, null, null));
		}
		if (uiResult.kind === "custom") {
			return toolResult(buildResult(params, "answered", uiResult.text, "custom", null));
		}
		return toolResult(buildResult(params, "answered", uiResult.label, "option", uiResult.index));
	},
};

export default function askUser(pi: ExtensionAPI): void {
	pi.registerTool(askUserTool);
}
