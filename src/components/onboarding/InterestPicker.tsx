'use client';
// InterestPicker (ARCHITECTURE §9.6, owner L5; L7 reuses it on /me with mode="edit").
// Morrow TopicChips grouped under the 9 root labels. Each group starts with "All of {root}" (a tile
// pick), then the root's topics (chip picks). A topic with sub-topics has a › disclosure that opens
// them in place: Technical → Computer Science → AI & Machine Learning. Every decision lives in the
// pure pickerReducer; this component only renders it and reports picks/blocked through onChange.
import { Fragment, useId, useState } from 'react';
import { Button, TopicChip } from '@/components/morrow';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import {
  chipHint,
  childrenOf,
  pickCounterText,
  pickerReducer,
  type InterestPickerProps,
  type PickerAction,
} from './lib/picker-state';

export type { InterestPickerProps, InterestPickerValue } from './lib/picker-state';

export function InterestPicker({ taxonomy, value, onChange, mode }: InterestPickerProps) {
  const baseId = useId();
  const [open, setOpen] = useState<TopicSlug[]>([]);
  const picked = new Set(value.picks.map((p) => p.slug));

  const dispatch = (action: PickerAction) => {
    const next = pickerReducer({ ...value, open }, action, taxonomy);
    if (next.open !== open) setOpen(next.open);
    if (next.picks !== value.picks || next.blocked !== value.blocked) onChange({ picks: next.picks, blocked: next.blocked });
  };

  const chip = (n: TopicNode, label = n.name) => (
    <TopicChip
      key={n.slug}
      label={label}
      selected={picked.has(n.slug)}
      hint={chipHint(n.slug, value.picks)}
      onToggle={() => dispatch({ type: 'toggle', slug: n.slug })}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {mode === 'onboarding' ? (
        <p className="ui-meta text-ink-muted" aria-live="polite">
          {pickCounterText(value.picks.length)}
        </p>
      ) : null}
      {childrenOf(taxonomy, null).map((root) => {
        const labelId = `${baseId}-${root.slug}`;
        return (
          <section key={root.slug} aria-labelledby={labelId} className="flex flex-col gap-3">
            <h3 id={labelId} className="ui-label text-ink-muted">
              {root.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {chip(root, `All of ${root.name}`)}
              {childrenOf(taxonomy, root.slug).map((topic) => {
                const subtopics = childrenOf(taxonomy, topic.slug);
                if (subtopics.length === 0) return chip(topic);
                const isOpen = open.includes(topic.slug);
                const panelId = `panel-${topic.slug}`;
                return (
                  <Fragment key={topic.slug}>
                    <span className="inline-flex items-center gap-1">
                      {chip(topic)}
                      {/* The chevron turns down while the panel is open (a static turn, no animation). */}
                      <span className={isOpen ? 'inline-flex rotate-90' : 'inline-flex'}>
                        <Button
                          variant="ghost"
                          icon="chevron-right"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          aria-label={`Show ${topic.name} topics`}
                          onClick={() => dispatch({ type: 'toggleDisclosure', slug: topic.slug })}
                        />
                      </span>
                    </span>
                    {isOpen ? (
                      <div id={panelId} role="group" aria-label={`${topic.name} topics`} className="flex basis-full flex-wrap gap-2 border-l border-rule pl-3">
                        {subtopics.map((s) => chip(s))}
                      </div>
                    ) : (
                      <div id={panelId} hidden />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default InterestPicker;
