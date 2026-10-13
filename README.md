# Ask the Human Pi Extension

## Overview

This project implements an `ask_user` tool for the Pi coding agent. The tool allows the agent to ask the user for clarification when an important decision has not been made.

The extension supports:
- Selecting from provided options
- Entering a custom answer
- Cancelling a question
- Handling unavailable interactive UI
- Avoiding unnecessary questions when instructions are already clear

## Demo: Grocery Inventory Reordering

For the demonstration, I used a grocery store inventory reordering scenario.

The store has only 5 bags of rice remaining and needs to restock. The agent has two supplier options:

- Supplier A: $100 per bag, delivery in 2 days
- Supplier B: $85 per bag, delivery in 5 days

Since the supplier has not been selected, the agent calls `ask_user` to ask the store manager which supplier to use.

After the user selects Supplier B, the agent prepares a draft restocking order based on that decision. No actual order is placed.

## How to Run

Open the terminal in the project folder and run:

```bash
pi -e ./src/ask-user.ts
```

The extension loads into Pi and can be used when the agent encounters an important unresolved decision.

## How to Test

Run the automated tests:

```bash
npm test
```

Check TypeScript:

```bash
npx tsc --noEmit
```

**Results:** 22 tests passed, 0 failed. TypeScript check passed.

## Test Scenarios

1. **Option Selection:** The user chooses a supplier from the interactive menu.
2. **Custom Answer:** The user types an answer instead of choosing a provided option.
3. **Cancellation:** The user presses Esc, and the agent does not assume a decision.
4. **No Clarification Needed:** The user already specifies the supplier, so the agent proceeds without calling `ask_user`.

Additional automated tests cover empty responses, unavailable UI, input validation, and tool registration.

## Review and Reflection

During review, a TypeScript compatibility issue with the structured result type was identified and fixed. The extension was also improved to display recommendations in the interactive interface.

One important design decision was to make the agent ask only when an unresolved choice significantly affects the outcome. If the user has already provided clear instructions, the agent should continue without asking unnecessary questions.

## Conclusion

This project demonstrates how a Pi coding agent can involve a human in important decisions while continuing routine tasks independently. The inventory reordering example shows how the agent collects user input and uses it to prepare a draft order.
