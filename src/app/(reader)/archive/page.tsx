// STUB (L0) — owner: L7. Replace freely; keep the route.
import type { Metadata } from 'next';
import { ArchiveCalendar } from '@/components/archive/ArchiveCalendar';
import { FIXTURE_ARCHIVE } from '@/contracts/fixtures';

export const metadata: Metadata = { title: 'Past editions' };

// Real version (L7): session + profile → listArchive + the streak strip. Stub: the fixture archive.
export default function ArchivePage() {
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p className="dateline text-ink-muted">{FIXTURE_ARCHIVE.length} editions</p>
        <h1 className="headline-lg">Past editions</h1>
        <p className="ui-text text-ink-soft">Every paper exactly as it was published, newest first.</p>
      </header>
      <ArchiveCalendar entries={FIXTURE_ARCHIVE} />
      <p className="ui-meta text-ink-muted">Stub page · owner L7</p>
    </div>
  );
}
