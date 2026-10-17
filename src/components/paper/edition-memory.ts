// What this browser remembers about one edition (ARCHITECTURE §9.7): the stories read and the
// stories skipped, in skip order, so a reload shows the same paper. Storage can be missing, full,
// blocked or hold garbage; every access is guarded and the page works without it.

export interface EditionMemory {
  read: string[];
  skipped: string[];
}

const EMPTY: EditionMemory = { read: [], skipped: [] };

export function memoryKey(editionId: string): string {
  return `subah_edition_${editionId}`;
}

/** Strings only, first occurrence wins; anything else means "nothing remembered". */
function idList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((v): v is string => typeof v === 'string'))];
}

export function loadEditionMemory(editionId: string): EditionMemory {
  try {
    const raw = window.localStorage.getItem(memoryKey(editionId));
    if (!raw) return { ...EMPTY };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...EMPTY };
    const read = idList((parsed as Record<string, unknown>).read);
    const skipped = idList((parsed as Record<string, unknown>).skipped);
    if (!read || !skipped) return { ...EMPTY };
    return { read, skipped };
  } catch {
    return { ...EMPTY };
  }
}

export function saveEditionMemory(editionId: string, m: EditionMemory): void {
  try {
    window.localStorage.setItem(memoryKey(editionId), JSON.stringify({ read: m.read, skipped: m.skipped }));
  } catch {
    // Private mode, a full quota or blocked storage: the paper still works for this visit.
  }
}
