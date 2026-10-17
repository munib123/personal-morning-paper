import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/contracts/database.types';

let client: SupabaseClient<Database> | null = null;

/** Singleton browser client (anonymous sign-in during onboarding, session cookies). */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  client = createBrowserClient<Database>(url, key) as unknown as SupabaseClient<Database>;
  return client;
}
