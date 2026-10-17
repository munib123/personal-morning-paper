// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.

export type TopicSlug = string;                         // 'technical.cs.web-dev'
export interface TopicNode { slug: TopicSlug; parentSlug: TopicSlug | null; level: 1 | 2 | 3; name: string; description: string; emoji: string | null; synonyms: string[]; }
export const rootOf = (s: TopicSlug): TopicSlug => s.split('.')[0];
export const ancestorsOf = (s: TopicSlug): TopicSlug[] => { const p = s.split('.'); return p.slice(0, -1).map((_, i) => p.slice(0, i + 1).join('.')); }; // root first: 'technical.cs.web-dev' → ['technical','technical.cs']
