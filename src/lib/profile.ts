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

interface MembershipRow {
  schools: { name: string } | null;
  subjects: { name: string } | null;
}

/**
 * Load the shell's header identity for the signed-in user. The "Centre · Subject"
 * subline comes from the user's primary `subject_membership` (the earliest by
 * created_at) — the permission model is per-space now, so the subtitle reflects
 * the space they joined first. Omitted when they belong to no space yet.
 */
export async function getHeaderProfile(): Promise<HeaderProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { name: 'there' };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase
      .from('subject_membership')
      .select('schools ( name ), subjects ( name )')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  // The embeds are many-to-one, so each resolves to a single object at runtime;
  // database.types.ts is still a placeholder, so narrow by hand.
  const row = membership as unknown as MembershipRow | null;

  const name = (profile as { full_name: string | null } | null)?.full_name ?? user.email ?? 'there';
  const school = row?.schools?.name;
  const subject = row?.subjects?.name;
  const subtitle =
    school && subject ? `${school} · ${subject}` : school ?? subject ?? undefined;

  return { name, subtitle };
}
