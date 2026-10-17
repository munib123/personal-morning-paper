# OnboardingStep

The frame for each onboarding screen: progress bars, step count, a serif question, the input, and Back / Continue.

- Four steps, each one question: 1 Welcome + name, 2 Topics (TopicChips), 3 Tell us more (TextField, AI-parsed) + sources to avoid, 4 Your routine (Segmented: length, delivery time). End on a preview of their first front page, not a "Done" screen.
- Provide `step`, `total`, `title` (a question, sentence case), optional `description`, the input as `children`, `onNext`, `onBack`, `onSkip`, `nextLabel`, `nextDisabled`, `footnote`.
- The Continue label states what is missing ("Pick 1 more") instead of a silent disabled button.
- Keep each step under 30 seconds; never ask for anything the paper cannot use.
