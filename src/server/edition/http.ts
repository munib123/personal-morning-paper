// Thin helpers for the L3 route handlers: one error policy, one body reader.
import { ZodError } from 'zod';

/**
 * Wraps a handler: a thrown Response (401 from requireUser, 503 no_candidates, …) is returned as is;
 * a ZodError is a 400 { error: 'invalid', issues }; anything else is logged and becomes 500 { error: 'internal' }.
 */
export function route<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response>): (req?: Request, ctx?: C) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req as Request, ctx as C);
    } catch (e) {
      if (e instanceof Response) return e;
      if (e instanceof ZodError) return Response.json({ error: 'invalid', issues: e.issues }, { status: 400 });
      console.error(`[api] ${req?.method ?? 'GET'} ${req?.url ?? ''} failed`, e);
      return Response.json({ error: 'internal' }, { status: 500 });
    }
  };
}

/** The JSON body whatever the content type (sendBeacon sends text/plain). Empty → {}; malformed → 400. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw Response.json({ error: 'invalid', issues: [{ message: 'malformed JSON' }] }, { status: 400 });
  }
}
