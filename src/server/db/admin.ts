import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/contracts/database.types';

// Service-role client for jobs and server write paths (bypasses RLS).
// Deliberately no `import 'server-only'`: tsx scripts import this module.
let admin: SupabaseClient<Database> | null = null;

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing');
  if (!key) throw new Error('SUPABASE_SECRET_KEY missing');
  admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
