# FeedbackBar

The four explicit learning signals on a story: More like this, Less like this, Save, Skip.

- Place it in a StoryCard `footer`, or float it (paper-raised, `shadow-float`) at the end of a story in the reader view. Use `compact` in dense lists.
- Provide `value` (`'more' | 'less' | null`), `saved`, and the handlers `onChange`, `onSave`, `onSkip`. More and Less toggle and are mutually exclusive.
- Every press must change something the reader can see: acknowledge with a one-line note ("Got it. More climate tech tomorrow.") and update tomorrow's mix.
- Pressed state is `pen-soft` ground, `pen` text and border. Never green/red thumbs.
