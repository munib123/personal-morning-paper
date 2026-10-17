// STUB (L0) — owner: L5. Replace freely; keep the props.
'use client';

import { useId } from 'react';
import type { InterestPick } from '@/contracts/profile';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { TopicChip } from '@/components/morrow';

export interface InterestPickerValue {
  picks: InterestPick[];
  blocked: TopicSlug[];
}

export interface InterestPickerProps {
  taxonomy: TopicNode[];
  value: InterestPickerValue;
  onChange: (v: InterestPickerValue) => void;
  mode: 'onboarding' | 'edit';
}

// TopicChips grouped under the root labels (Arts, Science, Technical …). A picked topic with
// children opens them in place underneath (Technical → Computer Science → web dev, AI …).
// Stub: no search, no mute UI (blocked passes through); L5 owns the real picker, L7 reuses it on /me.
export function InterestPicker({ taxonomy, value, onChange, mode }: InterestPickerProps) {
  const baseId = useId();
  const picked = new Set(value.picks.map((p) => p.slug));
  const childrenOf = (slug: TopicSlug) => taxonomy.filter((n) => n.parentSlug === slug);
  const roots = taxonomy.filter((n) => n.level === 1);

  const toggle = (node: TopicNode, on: boolean) => {
    if (on) {
      if (picked.has(node.slug)) return;
      onChange({ picks: [...value.picks, { slug: node.slug, via: 'chip' }], blocked: value.blocked.filter((b) => b !== node.slug) });
    } else {
      // Unpicking a topic also drops its sub-topics, which are only shown while it is picked.
      const inside = (s: TopicSlug) => s === node.slug || s.startsWith(`${node.slug}.`);
      onChange({ picks: value.picks.filter((p) => !inside(p.slug)), blocked: value.blocked });
    }
  };

  const chip = (n: TopicNode) => <TopicChip key={n.slug} label={n.name} selected={picked.has(n.slug)} onToggle={(on) => toggle(n, on)} />;

  return (
    <div className="flex flex-col gap-6" data-mode={mode}>
      {roots.map((root) => {
        const topics = childrenOf(root.slug);
        const chips = topics.length > 0 ? topics : [root];
        const labelId = `${baseId}-${root.slug}`;
        return (
          <section key={root.slug} aria-labelledby={labelId} className="flex flex-col gap-3">
            <h3 id={labelId} className="kicker text-ink-muted">
              {root.name}
            </h3>
            <div className="flex flex-wrap gap-3">{chips.map(chip)}</div>
            {chips
              .filter((n) => picked.has(n.slug))
              .map((n) => {
                const deeper = childrenOf(n.slug);
                if (deeper.length === 0) return null;
                return (
                  <div key={n.slug} role="group" aria-label={`More in ${n.name}`} className="flex flex-wrap gap-3 border-l border-rule pl-4">
                    {deeper.map(chip)}
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}

export default InterestPicker;
