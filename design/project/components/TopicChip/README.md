# TopicChip

A pill the reader taps to follow a topic; filled ink when selected.

- The main input of onboarding and of Settings → Topics. Show 15–24 at once, grouped under small `ui-label` headings (News, Interests, Local).
- Provide `label`, `selected`, `onToggle(selected)`; optional `hint` (a count or "popular") and `size="lg"` for touch-first screens.
- Selected = `ink` fill with `on-ink` text and a check; unselected = `rule-strong` outline with a plus.
- Ask for at least three, never force more than five. Free-text interests go in a TextField below the chips.
