# HW4 — Ask the Human (`ask_user`) — W2-0 Specification

**Status:** Design only. No extension code in this milestone.
**Scope:** W2-0 defines the tool contract, the asking policy, and the example
scenarios. Implementation and tests come in later milestones (W2-1+).

## 0. Context

We are building a reusable, model-callable `ask_user` tool for a Pi extension.
The tool lets an agent pause and get a human decision when — and only when — a
decision cannot be safely inferred.

We use **one Pi agent, not Herdr**. The tool runs inside the current agent turn,
blocks until the human responds (or cancels), and then returns a result the model
can act on. There is no second agent, no hand-off, and no background worker.

**Demonstration scenario:** grocery-store inventory reordering. The agent must
sometimes ask the human to choose between suppliers that differ in cost and
delivery time.

## 1. Design principles

1. **One question, one decision.** Never bundle multiple decisions into a single
   call.
2. **Ask only when it matters.** Asking is a cost; spend it on decisions that are
   material, unresolved, and hard to reverse.
3. **Options carry tradeoffs.** The human should be able to decide without
   follow-up questions.
4. **Preserve the human's words.** An answer is data, not a suggestion. Return it
   exactly as given.
5. **Every call terminates in a known state.** The agent must never be left
   hanging: `answered`, `cancelled`, or `unavailable`.
6. **Work everywhere.** Non-interactive modes must not crash or block; they
   report `unavailable`.

## 2. Tool contract

### 2.1 Inputs

Registered name: `ask_user`.

```ts
const Option = Type.Object({
  label: Type.String({
    description: "Short display label for the option (the exact value returned if chosen).",
  }),
  description: Type.Optional(Type.String({
    description: "The tradeoff: cost, delivery time, risk, effort, or consequence.",
  })),
});

const Recommendation = Type.Object({
  option: Type.String({
    description: "Label of the recommended option; must match one of options[].label.",
  }),
  rationale: Type.Optional(Type.String({
    description: "One-line reason for the recommendation.",
  })),
});

const AskUserParams = Type.Object({
  question: Type.String({
    description: "A single, specific question. No compound or leading questions.",
  }),
  reason: Type.String({
    description: "Brief reason the decision cannot be inferred and materially affects the task.",
  }),
  options: Type.Array(Option, {
    minItems: 2,
    maxItems: 3,
    description: "Two or three mutually exclusive options, each with its tradeoff.",
  }),
  recommendation: Type.Optional(Recommendation),
});
```

| Field | Required | Constraint | Purpose |
|---|---|---|---|
| `question` | yes | one decision, non-empty | What the human is deciding |
| `reason` | yes | brief, non-empty | Why we are asking (auditability + policy pressure) |
| `options` | yes | 2–3 items, unique labels | The choices, each with a tradeoff |
| `recommendation` | no | `option` must equal a provided label | Reduces burden when a default is clearly better |

**Input validation (fails before `execute` or as an argument error, not as one of
the three output statuses):**

- Fewer than 2 or more than 3 options → schema validation error.
- Duplicate option labels → argument error.
- `recommendation.option` not among the labels → argument error.
- Empty/whitespace `question` or `reason` → argument error.

Argument errors are a fourth, *failure* path and are not part of the three
semantic outputs below.

### 2.2 Outputs

Every successful call returns exactly one of three statuses.

```ts
type AskUserStatus = "answered" | "cancelled" | "unavailable";

interface AskUserStructured {
  status: AskUserStatus;
  question: string;
  options: string[];              // labels, in presented order
  answer: string | null;          // EXACT human text; null unless status === "answered"
  answerKind: "option" | "custom" | null;
  selectedIndex: number | null;   // 1-based index into options; null for custom/cancelled/unavailable
  recommendation: string | null;  // recommended label, if any
  message: string;                // model/human-readable summary
}
```

| Status | Meaning | `answer` | `answerKind` | `selectedIndex` |
|---|---|---|---|---|
| `answered` (option) | Human chose a listed option | exact label | `"option"` | 1-based index |
| `answered` (custom) | Human typed their own answer | exact typed text | `"custom"` | `null` |
| `cancelled` | Human dismissed the prompt (Esc) | `null` | `null` | `null` |
| `unavailable` | UI cannot run in this mode | `null` | `null` | `null` |

**Exact-answer rule.** For custom answers, the returned `answer` is the exact
submitted string. Do not trim, case-fold, re-word, or interpret it. Trimming is
used *only* to detect an empty submission (see §5).

**Model-facing `content` (text) mirrors the status:**

- option: `User selected option 2: "Supplier B (next-day)".`
- custom: `User answered: "Reorder only the dairy case, hold the rest."`
- cancelled: `User cancelled the question; no answer was provided.`
- unavailable: `ask_user is unavailable (<reason>); no answer was provided.`

The tool returns structured data via `outputSchema` + `structuredContent` so
programmatic callers (e.g. codemode scripts) receive `status`/`answer` directly.
`details` carries the same data for transcript rendering.

**Error signaling.** `answered` and `cancelled` are normal, non-error results.
`unavailable` is returned with `isError: true` (still carrying
`structuredContent`) so the model clearly sees the tool did not accomplish its
purpose and should proceed without an answer.

### 2.3 Availability and modes

| Mode | Behavior |
|---|---|
| `tui` (interactive) | Full custom component: option list + "Type something…" inline editor |
| RPC | `unavailable` in W2-0 (custom terminal components are not supported). Native-dialog fallback is a later milestone |
| JSON / print | `unavailable` |

- The tool must **never throw** merely because no UI exists.
- The tool must **never block** waiting for input in a mode that cannot collect it.
- Availability is decided before any UI call.

## 3. Asking policy

The tool's description and the agent's system guidance should encode this policy.

### 3.1 Ask when all of these hold

1. The decision is **unresolved** — not already answered in the conversation,
   repo, task, or standing instructions.
2. The decision **materially affects** at least one of:
   - **User-visible behavior** (what the user sees or receives),
   - **Scope** (what is included or excluded),
   - **Rework** (a wrong choice forces redoing work).
3. The decision is **hard or costly to reverse**, or has external side effects
   (spending money, placing an order, notifying people).
4. There are **2–3 plausible options** with genuinely different tradeoffs.
5. The preference is a **human judgment** (values, risk appetite, budget
   authority) that cannot be derived from data or defaults.

### 3.2 Proceed without asking when any of these hold

1. Requirements are already clear from the request, context, or prior answers.
2. The choice is **routine and reversible** (naming, formatting, ordering,
   default values that are easy to change).
3. A safe, conventional default exists and the downside is small.
4. The information can be obtained by inspecting files, data, or running tools.
5. The user already answered the same or an equivalent question in this session.

### 3.3 Anti-patterns

- Don't ask to confirm an obvious default ("Should I save the file?").
- Don't ask for facts you can look up.
- Don't ask the same decision twice.
- Don't bundle several decisions into one call.
- Don't present more than three options or options without tradeoffs.
- Don't ask when the "decision" is actually already constrained by a prior answer.
- Don't use `ask_user` as a progress report; it is only for decisions.

### 3.4 Recommendation behavior

- Include a `recommendation` when one option is clearly better given the stated
  goal; it lowers the human's effort and usually shortens the exchange.
- Omit it when options are a genuine values tradeoff with no defensible default.
- Never recommend an option outside the presented set.

## 4. Inventory scenarios

### 4.1 Should ask

| Scenario | Why it clears the bar |
|---|---|
| **Supplier choice under stock-out risk** — Supplier A: 8% cheaper, 5-day delivery. Supplier B: 15% more, next-day. | Material user-visible cost/availability tradeoff; hard to reverse once an order is placed. |
| **Reorder quantity when cash is tight** — restock full par vs. partial restock to preserve budget. | Budget authority and risk appetite are human judgments. |
| **Perishable substitution** — preferred supplier is out; substitute a similar item or wait. | Affects what customers receive; not inferable. |
| **Auto-approval threshold** — approve reorders automatically below $X, or always confirm. | Sets scope of the agent's authority; persistent effect. |
| **Adding a new/untested product** to the standard reorder. | Expands scope and may create waste. |

### 4.2 Should proceed without asking

| Scenario | Why it is safe to proceed |
|---|---|
| Reorder a routine staple at its normal par level from the default supplier, within budget. | Routine, reversible, conventional default. |
| Apply an existing standing rule ("reorder when below reorder point"). | Already-approved policy; no new decision. |
| Fix a typo or formatting in item names/units. | Trivial and reversible. |
| Deduplicate duplicate inventory rows. | Objective data cleanup. |
| Read inventory levels and produce a report. | Information gathering; no side effect. |
| Choose the default supplier when only one is in stock. | Constrained by data; no real choice. |

## 5. Worked demo (supplier choice)

Agent calls:

```json
{
  "question": "Which supplier should we reorder the low-stock eggs from?",
  "reason": "Eggs are 2 days from stock-out and the two suppliers differ on cost and delivery, which changes both margin and availability.",
  "options": [
    {
      "label": "Supplier A (cheap, 5-day)",
      "description": "8% lower cost, but arrives after the projected stock-out."
    },
    {
      "label": "Supplier B (next-day)",
      "description": "15% higher cost, but restocks before the stock-out."
    }
  ],
  "recommendation": {
    "option": "Supplier B (next-day)",
    "rationale": "Avoiding a stock-out protects sales that outweigh the 15% premium."
  }
}
```

Human selects Supplier B. Result:

```json
{
  "status": "answered",
  "question": "Which supplier should we reorder the low-stock eggs from?",
  "options": ["Supplier A (cheap, 5-day)", "Supplier B (next-day)"],
  "answer": "Supplier B (next-day)",
  "answerKind": "option",
  "selectedIndex": 2,
  "recommendation": "Supplier B (next-day)",
  "message": "User selected option 2: \"Supplier B (next-day)\"."
}
```

If the human instead typed `Order 3 cases from B, hold A`, the result has
`answerKind: "custom"`, `selectedIndex: null`, and `answer` equal to that exact
string.

## 6. Test-driven development plan (for W2-1+)

Write these tests first; implement until green.

**Option selection**
1. Selecting the first option returns `answered`, exact label, `answerKind: "option"`, `selectedIndex: 1`.
2. Selecting the last option returns the correct 1-based `selectedIndex`.
3. Up/Down navigation clamps at the ends and does not wrap.
4. Options render with their tradeoff descriptions.

**Custom answers**
5. Choosing "Type something…" and submitting text returns `answerKind: "custom"`, `selectedIndex: null`.
6. The custom `answer` preserves exact casing, spacing, and punctuation.
7. Custom text is not confused with an option label.

**Cancellation**
8. Esc on the option list returns `cancelled`, `answer: null`, and a clear message.
9. Esc inside the editor returns to the option list; it does not cancel.
10. Cancelling after typing discards the typed text.

**Empty responses**
11. Submitting an empty custom answer does not resolve the prompt (no `answered`).
12. Submitting a whitespace-only answer does not resolve the prompt.
13. After a rejected empty submission, a valid answer or Esc still terminates the call.

**Unavailable UI**
14. In `print`/`json` mode the tool returns `unavailable` and never throws.
15. In RPC mode the tool returns `unavailable` in W2-0.
16. No UI method is called when the mode is unavailable.
17. `unavailable` carries `structuredContent` and is marked `isError: true`.

**Contract / schema**
18. Fewer than 2 or more than 3 options is rejected by validation.
19. A `recommendation.option` not in the labels is rejected.
20. `answered` and `cancelled` results are not marked as errors.
21. `details` and `structuredContent` agree with the model-facing `content`.

## 7. Non-goals (W2-0)

- No extension code, no UI implementation, no test harness.
- No multi-agent / Herdr orchestration.
- No RPC native-dialog fallback (tracked for a later milestone).
- No multi-question batches, free-form surveys, or defaults/timeouts.

## 8. Open questions

1. Should `reason` be surfaced in the transcript header or kept model-only?
2. Should a timeout or default option ever auto-resolve, or is cancellation the
   only non-answer path?
3. Should answers be persisted across turns to prevent re-asking the same
   decision, and if so, where (tool `details` vs. session entry)?
