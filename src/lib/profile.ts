// Shared header identity for the app shell — the signed-in teacher's display
// name and "Centre · Subject" subline. Goes through the auth'd, cookie-bound
// Supabase client, so RLS scopes the read to the user's own profile.

import { createClient } from '@/lib/supabase/server';

export interface HeaderProfile {
  /** Display name (full_name, falling back to email, then a friendly default). */
  name: string;
  /** "School · Subject" subline, or undefined when neither is set. */
  subtitle?: string;
}

interface ProfileRow {
  full_name: string | null;
  schools: { name: string } | null;
  subjects: { name: string } | null;
}

/** Load the shell's header identity for the signed-in user. */
export async function getHeaderProfile(): Promise<HeaderProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { name: 'there' };

  const { data } = await supabase
    .from('profiles')
    .select('full_name, schools ( name ), subjects ( name )')
    .eq('id', user.id)
    .maybeSingle();

  // The embeds are many-to-one, so each resolves to a single object at runtime;
  // database.types.ts is still a placeholder, so narrow by hand.
  const row = data as unknown as ProfileRow | null;

  const name = row?.full_name ?? user.email ?? 'there';
  const school = row?.schools?.name;
  const subject = row?.subjects?.name;
  const subtitle =
    school && subject ? `${school} · ${subject}` : school ?? subject ?? undefined;

  return { name, subtitle };
}
