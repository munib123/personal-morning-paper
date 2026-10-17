// Reader keys (every gesture also has a button): j / k next and previous story, x skip, o open the
// story sheet, s save, b switch between the Front page and Bytes. Never while typing in a field, and
// never with Ctrl, Cmd or Alt held (those belong to the browser: Ctrl+S, Cmd+K…).
export type BytesAction = 'next' | 'prev' | 'skip' | 'open' | 'save' | 'toggle';

const KEYS: Record<string, BytesAction> = { j: 'next', k: 'prev', x: 'skip', o: 'open', s: 'save', b: 'toggle' };
const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function keyToAction(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}): BytesAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.target && (e.target.isContentEditable || (e.target.tagName && FIELDS.has(e.target.tagName.toUpperCase())))) return null;
  if (e.key.length !== 1) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}
