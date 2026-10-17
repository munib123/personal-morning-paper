// A chainable, thenable stand-in for the supabase-js query builder (test-only).
// Every `from(table)…` chain is recorded as a Query; awaiting it asks `resolve(query)` for { data, error }.
export interface Query {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc';
  columns?: string;
  values?: unknown;
  options?: unknown;
  filters: [string, string, unknown][];
  order: [string, unknown][];
  limit?: number;
  single?: 'single' | 'maybeSingle';
  selectAfterWrite?: string;
  head?: boolean;
}

export interface Result {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export type Resolver = (q: Query) => Result | undefined;

export function fakeSupabase(resolve: Resolver) {
  const calls: Query[] = [];
  const builder = (q: Query): unknown => {
    const b: Record<string, unknown> = {};
    const chain = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
      fn(...args);
      return proxy;
    };
    Object.assign(b, {
      select: chain((cols, opts) => {
        if (q.op === 'select') {
          q.columns = cols as string;
          q.head = (opts as { head?: boolean } | undefined)?.head === true;
        } else q.selectAfterWrite = (cols as string) ?? '*';
      }),
      insert: chain((v, o) => Object.assign(q, { op: 'insert', values: v, options: o })),
      upsert: chain((v, o) => Object.assign(q, { op: 'upsert', values: v, options: o })),
      update: chain((v, o) => Object.assign(q, { op: 'update', values: v, options: o })),
      delete: chain((o) => Object.assign(q, { op: 'delete', options: o })),
      order: chain((col, o) => q.order.push([col as string, o])),
      limit: chain((n) => (q.limit = n as number)),
      range: chain(() => undefined),
      single: chain(() => (q.single = 'single')),
      maybeSingle: chain(() => (q.single = 'maybeSingle')),
    });
    for (const f of ['eq', 'neq', 'in', 'gte', 'gt', 'lte', 'lt', 'is', 'not', 'contains', 'filter', 'match', 'or']) {
      b[f] = chain((col, val) => q.filters.push([f, col as string, val]));
    }
    const proxy: unknown = new Proxy(b, {
      get(target, prop) {
        if (prop === 'then') {
          return (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => {
            calls.push(q);
            let r: Result | undefined;
            try {
              r = resolve(q);
            } catch (e) {
              return Promise.reject(e).then(onOk, onErr);
            }
            const out = { data: r?.data ?? (q.single ? null : []), error: r?.error ?? null, count: r?.count ?? null };
            return Promise.resolve(out).then(onOk, onErr);
          };
        }
        return target[prop as string];
      },
    });
    return proxy;
  };
  const client = {
    from: (table: string) => builder({ table, op: 'select', filters: [], order: [] }),
    rpc: (fn: string, args: unknown) => builder({ table: fn, op: 'rpc', values: args, filters: [], order: [] }),
  };
  return { client, calls };
}

/** The value of the first `eq` filter on `col`, if any. */
export const eqOf = (q: Query, col: string): unknown => q.filters.find(([f, c]) => f === 'eq' && c === col)?.[2];
