# Button

The paper's controls: square-shouldered, 44px tall, labels in `ui-button`.

- `primary` (ink fill, `on-ink` label) is the main action on a screen: Continue, Build my paper, Read today's paper.
- `accent` (press fill) is rarer: one per screen at most, for the hero action such as Download PDF.
- `secondary` (outlined in `rule-strong`) and `ghost` for everything else; ghost for Back, Skip and icon-only toggles.
- Provide children (label), optional `icon` / `iconRight`, `size`, `href` to render a link, and `aria-label` when icon-only.
- Labels are sentence case verbs: "Build my paper", not "SUBMIT" or "Click here".
