// Story pictures for the PDF, fetched server-side and inlined as data URIs so the render never waits on a
// remote host. Anything slow, large, non-image or non-http(s) is skipped: the paper prints a fallback block.
export interface InlineImageOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

const skip = (host: string, reason: string): null => {
  console.warn('[pdf] image skipped', { host, reason });
  return null;
};

/** The image at `url` as a `data:image/…;base64,` URI, or null. Never throws. */
export async function inlineImage(url: string | null, opts: InlineImageOptions = {}): Promise<string | null> {
  if (!url) return null;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;

  const { timeoutMs = 3000, maxBytes = 1_000_000, fetchImpl = fetch } = opts;
  const host = target.host;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The race also covers a fetch implementation that ignores the abort signal.
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(skip(host, `timeout ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const load = async (): Promise<string | null> => {
    const res = await fetchImpl(target.href, { signal: controller.signal, redirect: 'follow', headers: { accept: 'image/*' } });
    if (!res.ok) return skip(host, `status ${res.status}`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) return skip(host, `type ${type || 'none'}`);
    const declared = Number(res.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
      void res.body?.cancel().catch(() => {});
      return skip(host, `declared ${declared} bytes`);
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > maxBytes) return skip(host, `${bytes.byteLength} bytes`);
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  };

  try {
    return await Promise.race([load(), timeout]);
  } catch (err) {
    return skip(host, err instanceof Error ? err.message : 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
}
