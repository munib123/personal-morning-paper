# W2-audio: "Listen to today's paper" handoff

Status: ready for merge (branch `lane/W2-audio`). Nothing outside this lane's folders was edited; the two mounts below are for the integrator.

The paper reads itself on the commute with the browser's own voice (`SpeechSynthesis`): no server, no Gemini quota, works offline. It reads the edition in page order; for each story the section kicker once when it changes, then the headline, then the summary of the tier the card shows. Skipped stories are not read. A story read to its end is reported to the page, so it counts as read and the paper keeps learning while you listen.

## Done

- `src/lib/audio/queue.ts` (pure): `buildReadingQueue(items, { skippedIds, tier, sectionNames, lang })` → `ReadingChunk[]` (`{ id, section, headline, text, words, announceSection }`), `estimateMinutes(queue, wpm = 160)` (whole minutes, rounded up), `splitForSynthesis(text, maxChars = 200)` (sentences, then clauses, then spaces; Chrome stalls on long utterances), `sectionNameOf(slug, names)`.
- `src/lib/audio/voices.ts` (pure): `pickVoice(voices, { lang, preferredName })` ranks the stored voice, then a natural or Google English voice, then the default; Urdu text (`hasUrduScript`) gets a `ur-*` voice, else Hindi, else English.
- `src/lib/audio/prefs.ts` (pure): rate (`0.9 | 1 | 1.2`) and voice name under `localStorage["subah.audio.v1"]`, every read and write in try/catch.
- `src/lib/audio/player.ts`: the engine outside React (`createReadAloudPlayer({ synth, Utterance, storage }, { onStoryFinished, onPlay })`): play / pause / resume / next / prev / stop / setRate / setQueue, a generation counter so cancelled utterances cannot advance the queue, a 10 s `resume()` tick against Chrome's 15 s stall, one active player per page (the sheet button and the bar never speak over each other), and `setQueue` follows skips while playing.
- `src/components/audio/useReadAloud.ts`: `useReadAloud(queue, { onStoryFinished, onPlay })` → `{ status: 'idle'|'playing'|'paused'|'done'|'unsupported', currentId, index, rate, voiceName, supported, current, minutes, play, pause, resume, toggle, next, prev, stop, setRate }`. Bound with `useSyncExternalStore`, so the server renders the "unsupported" snapshot (nothing) and the client shows the bar after hydration, with no hydration mismatch.
- `src/components/audio/ListenBar.tsx`: Morrow only. Collapsed: one ghost `Button` "Listen · 7 min". Expanded (first press also starts reading): a thin `bg-paper-raised` bar with Previous / Play-Pause / Next, "Story 3 of 20 · 7 min" (`dateline`), the current section `kicker` and headline in `deck` (`aria-live="polite"`), the speed as the Morrow `Segmented` (0.9× / 1× / 1.2×) in a `role="group"` named "Reading speed", and a close that stops the voice. Hidden entirely where `speechSynthesis` does not exist. Icons are lucide (already a dependency) at `strokeWidth={1.75}`.
- `src/components/audio/StoryListenButton.tsx`: one story from the sheet, deep summary: "Listen · 1 min" → "Pause" → "Resume" (`aria-pressed`). Closing the sheet unmounts it and stops the voice.
- Tests: `src/lib/audio/*.test.ts` (node, 33 tests) and `src/components/audio/*.test.tsx` (dom, 9 tests, against `src/components/audio/fake-speech.ts`).

## Verify

```
npx vitest run src/lib/audio src/components/audio      # 6 files, 44 tests passed
npx eslint src/lib/audio src/components/audio           # clean
npm run typecheck && npm run lint && npm test && npm run build
```

In a browser, after the two mounts below: `http://localhost:3000/today/preview` (`DEMO_MODE=1`) or `/today`. Press "Listen · N min" under the masthead: the bar opens, Chrome or Edge starts reading "World. Headline. Summary…", the headline in the bar changes story by story, read stories dim and "N of 20 read" grows. Skip a story while it reads: the voice moves on. Open a story and press "Listen · 1 min" in the sheet. Check at 390 px (controls wrap onto two rows) and 1280 px.

Browser notes: Chrome and Edge have the best voices (Edge's "Natural" voices are picked first when present); Safari works; Firefox on Windows depends on installed OS voices. Playback needs a user gesture, which the Listen button is.

## Integration patches (exact; apply on `main` after merging `lane/W2-audio`)

### 1. Front page: the bar under the masthead (`src/components/paper/FrontPage.tsx`, L4)

Imports, before:

```tsx
import { useMemo } from 'react';
import { SectionHeader, TakeawayBox } from '@/components/morrow';
```

after:

```tsx
import { useMemo } from 'react';
import { ListenBar } from '@/components/audio/ListenBar';
import { SectionHeader, TakeawayBox } from '@/components/morrow';
```

In `FrontPage`, before:

```tsx
  const { edition, state, readOnly } = useEdition();
```

after:

```tsx
  const { edition, state, readOnly, dispatch, signals } = useEdition();
```

Markup, before:

```tsx
      <PaperMasthead readerName={readerName} city={city} onHowMade={openHowMade} />
      <EditorNote edition={edition} />
```

after:

```tsx
      <PaperMasthead readerName={readerName} city={city} onHowMade={openHowMade} />
      <ListenBar
        className="mt-4"
        items={state.items}
        skippedIds={state.skippedIds}
        sectionNames={edition.sectionNames}
        onPlay={() => signals.track({ type: 'audio_play' })}
        onStoryFinished={(id) => {
          dispatch({ type: 'markRead', articleId: id });
          signals.track({ type: 'open', articleId: id, meta: { mode: 'audio' } });
        }}
      />
      <EditorNote edition={edition} />
```

This is the `onStoryFinished → read signal` wiring: L4's own `useSignals` (through `EditionContext.signals`) logs `audio_play` once per listening session (an `editionId`-only signal, already in `SIGNAL_TYPES`) and an `open` with `meta.mode = 'audio'` for every story read to its end; `markRead` dims the headline and moves "N of 20 read". The audio lane never imports `useSignals`.

If the bar is wanted in the masthead's action row instead, the same `<ListenBar …/>` goes inside the `actions` div of the full `Masthead` in `src/components/paper/PaperMasthead.tsx`, using `useEdition()` there; the FrontPage mount is the recommended one because the expanded bar needs the full width.

### 2. Story sheet: one story (`src/components/story/StorySheet.tsx`, L4)

Imports, before:

```tsx
import { Button, FeedbackBar, WhyTag } from '@/components/morrow';
import { useEditionOptional } from '@/components/paper/EditionContext';
```

after:

```tsx
import { StoryListenButton } from '@/components/audio/StoryListenButton';
import { Button, FeedbackBar, WhyTag } from '@/components/morrow';
import { useEditionOptional } from '@/components/paper/EditionContext';
```

Markup, before:

```tsx
            <p className="ui-meta mt-3 text-ink-muted">{meta}</p>
          </div>
```

after:

```tsx
            <p className="ui-meta mt-3 text-ink-muted">{meta}</p>
            <div className="mt-2">
              <StoryListenButton item={item} sectionNames={names} onPlay={track ? () => track({ type: 'audio_play', articleId: a.id }) : undefined} />
            </div>
          </div>
```

(`track`, `names` and `a` already exist in `StorySheet`.) Opening the sheet already marks the story read, so no `onStoryFinished` is needed there.

### 3. Bytes view (optional, L4)

`ListenBar` takes the same props from `EditionContext` wherever the Bytes view renders its header; the compact masthead is `fixed`, so mount it in the flow below it, not inside it.

## Loom line (10 s)

"And when you'd rather listen: one tap, and the paper reads itself, section by section, in your browser's own voice, with no server and no API behind it. Every story it reads to the end counts as read, so the paper keeps learning from your commute too."

## Missing

- No voice picker in the UI: the voice is chosen automatically (stored voice, else a natural or Google English voice) and remembered. `pickVoice` and the prefs already support a choice; a Segmented or `<select>` of `speechSynthesis.getVoices()` is a 20-minute add.
- Urdu: the queue reads `ArticleCard.ur` when `lang: 'ur'` is passed and the player picks a `ur-PK` voice, but nothing in the UI passes `lang: 'ur'` yet (the Urdu lane is out of scope today). Wire `lang={edition.presentation.lang}` when editions carry Urdu text.
- No real-browser screenshots in `docs/handoff/screens/` (the bar is not mounted on any page until patch 1 lands).
- `gemini-3.8-flash-tts` (studio voices, a 2-host podcast) is out of scope today by design.

## Risks

- Browser voices vary: Chrome on Windows reads with "Microsoft Zira" or a Google voice, Edge with its Natural voices, Firefox only with OS voices. Demo in Chrome or Edge.
- Chrome needs a user gesture before speaking; the Listen button is one. Autoplay on page load would be silently refused.
- Chrome pauses speech when the tab goes to the background on some platforms; the resume tick restarts it on return. A long story is split into ≤200-character utterances, so a stall costs at most one sentence.
- Two players share one synthesizer; the engine stops the other player before speaking, so the bar's state cannot drift from the audio. If a third place mounts `useReadAloud`, nothing more is needed.
- The `open` signal with `meta.mode = 'audio'` is counted by L3 like a sheet open (a positive signal). If that is too strong, change the wiring in patch 1 to `signals.track({ type: 'dwell', articleId: id, value: <ms>, meta: { mode: 'audio' } })`; the player does not time stories yet, so `value` would need `words / wpm * 60000`.
