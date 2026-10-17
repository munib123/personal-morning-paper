// Shown the moment Past editions opens, while the archive is read (design README "Motion and states"):
// the page's own frame with a dateline status, then skeleton blocks in paper-sunk shaped like the
// last 7 mornings and a week of edition cards. No spinner; the real page replaces it in place.
const CARDS = 6;

export default function ArchiveLoading() {
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6" aria-busy="true">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p role="status" className="dateline text-ink-muted">
          Gathering your past editions
        </p>
        <h1 className="headline-lg text-ink">Past editions</h1>
        <div data-skeleton className="h-5 w-80 max-w-full bg-paper-sunk" />
      </header>
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div data-skeleton className="size-3 bg-paper-sunk" />
              <div data-skeleton className="h-3 w-2 bg-paper-sunk" />
            </div>
          ))}
        </div>
        <div data-skeleton className="h-4 w-36 bg-paper-sunk" />
      </div>
      <section className="flex flex-col">
        <div className="mb-4 flex items-baseline gap-3 border-t-3 border-ink pt-2">
          <div data-skeleton className="h-5 w-40 bg-paper-sunk" />
        </div>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: CARDS }, (_, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-b-card border border-t-3 border-rule border-t-ink bg-paper px-5 pt-4 pb-5">
              <div data-skeleton className="h-7 w-32 bg-paper-sunk" />
              <div data-skeleton className="h-3 w-40 bg-paper-sunk" />
              <div data-skeleton className="mt-1 h-5 w-full bg-paper-sunk" />
              <div data-skeleton className="h-5 w-3/4 bg-paper-sunk" />
              <div className="mt-2 flex gap-2">
                <div data-skeleton className="h-8 w-16 bg-paper-sunk" />
                <div data-skeleton className="h-8 w-16 bg-paper-sunk" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
