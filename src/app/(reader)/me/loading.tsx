// Shown the moment Your interests opens, while what the paper learned is read (design README
// "Motion and states"): the page's own frame with a dateline status, the three tabs, then skeleton
// blocks in paper-sunk shaped like the learned summary and the interest bars. No spinner.
const BARS = ['w-11/12', 'w-4/5', 'w-2/3', 'w-1/2', 'w-2/5'];

export default function MeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6" aria-busy="true">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <p role="status" className="dateline text-ink-muted">
          Opening your paper
        </p>
        <h1 className="headline-lg text-ink">Your paper</h1>
        <div data-skeleton className="h-5 w-96 max-w-full bg-paper-sunk" />
      </header>
      <div className="flex flex-col gap-8">
        <div className="flex gap-6 border-b border-rule">
          {['w-24', 'w-28', 'w-32'].map((w, i) => (
            <div key={w} className={`flex min-h-11 items-center border-b-2 ${i === 0 ? 'border-ink' : 'border-transparent'}`}>
              <div data-skeleton className={`h-4 ${w} bg-paper-sunk`} />
            </div>
          ))}
        </div>
        <div className="flex max-w-(--measure) flex-col gap-3">
          <div className="mb-1 border-t-3 border-ink pt-2">
            <div data-skeleton className="h-5 w-48 bg-paper-sunk" />
          </div>
          <div data-skeleton className="h-6 w-full bg-paper-sunk" />
          <div data-skeleton className="h-6 w-5/6 bg-paper-sunk" />
        </div>
        <div className="flex max-w-(--measure) flex-col gap-4">
          {BARS.map((w) => (
            <div key={w} className="flex flex-col gap-2">
              <div data-skeleton className="h-4 w-40 bg-paper-sunk" />
              <div data-skeleton className={`h-2 ${w} bg-paper-sunk`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
