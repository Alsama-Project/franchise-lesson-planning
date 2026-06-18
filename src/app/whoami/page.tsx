import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Tiny dev/setup page that surfaces the signed-in user's auth uid. It's still
 * needed to run the supabase/admin provisioning and sample-plan seed before the
 * editor and in-app provisioning land. Safe to delete once those exist.
 */
export default async function WhoAmI() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id ?? '')
    .maybeSingle();

  const name = profile?.full_name ?? user?.email ?? 'there';

  return (
    <AppShell name={name}>
      <Card className="p-8">
        <h1 className="text-[22px] font-semibold">Your account</h1>
        <p className="mt-2 text-[15px] text-text-muted">
          Signed in as {name}
          {user?.email ? ` (${user.email})` : ''}.
        </p>
        <p className="mt-6 text-[12.5px] text-text-faint">
          Your user id (for supabase/admin setup):{' '}
          <code className="rounded-badge bg-surface-subtle px-1.5 py-0.5 font-mono text-text-muted">
            {user?.id ?? '(none)'}
          </code>
        </p>
        <p className="mt-8 text-[13px]">
          <Link href="/" className="text-teal underline underline-offset-2">
            ← Back to your week
          </Link>
        </p>
      </Card>
    </AppShell>
  );
}
