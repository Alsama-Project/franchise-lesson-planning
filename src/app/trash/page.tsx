import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { TrashView } from '@/components/trash/TrashView';
import { listTrashedLessons } from '@/lib/actions/lesson-trash';
import { getHeaderProfile } from '@/lib/profile';

// Rendered per-request so it reflects the live session's trashed lessons.
export const dynamic = 'force-dynamic';

/**
 * The per-teacher recycle bin — the signed-in user's soft-deleted lessons, with
 * Restore and Delete-permanently. The proxy redirects signed-out users to /login.
 */
export default async function TrashPage() {
  const [lessons, { name, subtitle }, t] = await Promise.all([
    listTrashedLessons(),
    getHeaderProfile(),
    getTranslations('board'),
  ]);

  return (
    <AppShell name={name} subtitle={subtitle}>
      <div className="mb-[22px]">
        <Link
          href="/"
          className="text-[13px] font-medium text-teal underline underline-offset-2 hover:text-teal-deep"
        >
          {t('trash.backToBoard')}
        </Link>
        <h1 className="mt-[10px] text-[25px] font-semibold tracking-[-0.01em]">{t('trash.title')}</h1>
      </div>
      <TrashView lessons={lessons} />
    </AppShell>
  );
}
