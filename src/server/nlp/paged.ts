// PostgREST returns at most 1000 rows per request (Supabase max_rows): read big selects page by page.
export type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function selectPaged<T>(page: (from: number, to: number) => PageResult<T>, limit = Infinity, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  while (out.length < limit) {
    const from = out.length;
    const to = Math.min(from + pageSize, limit) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
