# TextField

A labelled input or textarea on paper-raised with a `rule-strong` border.

- In onboarding, use a multiline field for free-text interests that the AI parses into topics; show the parsed topics as TopicChips straight after.
- Provide `label` (always visible, never placeholder-only), `value`, `onChange(value)`; optional `hint`, `error`, `placeholder`, `multiline`, `rows`.
- Errors say what to do next, in `press` on paper: "We could not find that city. Try Lahore."
