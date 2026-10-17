// Classify a Gemini / AI SDK failure (ARCHITECTURE §10.3 item 6; research 13 §1.2, §3.3).
// Gemini puts the wait in the 429 body (RetryInfo.retryDelay), not in headers.
import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';
import { ZodError } from 'zod';

export type ErrorKind = 'rate_limit' | 'quota_day' | 'server' | 'timeout' | 'schema' | 'auth' | 'other';

type Detail = { '@type'?: string; retryDelay?: string; violations?: { quotaId?: string; quotaValue?: string }[] };

function detailsOf(e: APICallError): Detail[] {
  const fromData = (e.data as { error?: { details?: Detail[] } } | undefined)?.error?.details;
  if (Array.isArray(fromData)) return fromData;
  try {
    const body = JSON.parse(e.responseBody ?? '') as { error?: { details?: Detail[] } };
    return Array.isArray(body.error?.details) ? body.error.details : [];
  } catch {
    return [];
  }
}

/** "27s" → 27000, "1.5s" → 1500. */
function parseDelay(raw: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw?.trim() ?? '');
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');

export function classifyError(err: unknown): { kind: ErrorKind; retryDelayMs: number | null } {
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (NoObjectGeneratedError.isInstance(e) || e instanceof ZodError) return { kind: 'schema', retryDelayMs: null };
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    if (status === 429) {
      const details = detailsOf(e);
      const retry = details.find((d) => String(d['@type']).endsWith('RetryInfo'))?.retryDelay;
      const violation = details.find((d) => String(d['@type']).endsWith('QuotaFailure'))?.violations?.[0];
      const daily = /PerDay/i.test(violation?.quotaId ?? '') || violation?.quotaValue === '0';
      return { kind: daily ? 'quota_day' : 'rate_limit', retryDelayMs: parseDelay(retry) };
    }
    if (status !== undefined && status >= 500) return { kind: 'server', retryDelayMs: null };
    if (status === 408) return { kind: 'timeout', retryDelayMs: null };
    if (status === 400 || status === 401 || status === 403 || status === 404) return { kind: 'auth', retryDelayMs: null };
    if (status === undefined && e.isRetryable) return { kind: 'server', retryDelayMs: null }; // network failure
    return { kind: 'other', retryDelayMs: null };
  }
  if (isAbort(e) || (e instanceof Error && isAbort(e.cause))) return { kind: 'timeout', retryDelayMs: null };
  return { kind: 'other', retryDelayMs: null };
}
